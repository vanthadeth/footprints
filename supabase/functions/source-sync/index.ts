// Footprints: sync a sheet tab into the tables its mappings feed (Super Admin).
//
// A source is one Google Sheet tab (sync_sources); its mappings are the
// sync_definitions with engine = 'footprints', each feeding one table through
// its sync_column_maps. One run reads the tab once and applies every selected
// mapping in order (parents first) with app.sync_engine_apply (migration 0120).
// Mappings still on the older runner (engine = 'legacy') are never touched.
// The reading and converting rules are in engine.ts, tested from the app side.
//
// Actions (POST JSON, signed-in Super Admin only):
//   { action: 'preview' | 'run', source_id, sync_id? } -> sync the source's Footprints-engine
//        mappings, or just one (sync_id). Preview changes nothing and records no run.
//   { action: 'switch', sync_id, engine: 'footprints' | 'legacy' } -> move a mapping to the
//        Footprints engine (checked first; the older runner is told to skip it by active = false),
//        or hand it back.
//
// Deployed with verify_jwt = true.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { buildRows, invoiceInsights, planProblem, type ColumnMap, type InvoiceInsights, type MappingPlan } from './engine.ts'
import { gidForTab, linkGid, parseCsv, sheetCsvUrl, sheetId, type DateOrder, type RowProblem } from './parse.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_BYTES = 10 * 1024 * 1024
const BATCH = 500

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** A friendly reason for a failed sync. */
class SyncError extends Error {}

const UNREADABLE = 'The sheet isn’t shared as “Anyone with the link can view”. Change its sharing in Google Sheets, then try again.'

async function tabGid(url: string, tab: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId(url)}/htmlview`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new SyncError('Couldn’t reach Google Sheets. Try again in a minute.')
  }
  if (res.status === 404) throw new SyncError('Couldn’t find that sheet. Check the link.')
  if (!res.ok) throw new SyncError(UNREADABLE)
  const gid = gidForTab(await res.text(), tab)
  if (!gid) throw new SyncError(`Couldn’t find a tab named “${tab.trim()}”.`)
  return gid
}

async function fetchCsv(url: string, tab: string): Promise<string> {
  const gid = !linkGid(url) && tab.trim() ? await tabGid(url, tab) : null
  const csvUrl = sheetCsvUrl(url, gid)!
  let res: Response
  try {
    res = await fetch(csvUrl, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new SyncError('Couldn’t reach Google Sheets. Try again in a minute.')
  }
  const type = res.headers.get('content-type') ?? ''
  if (res.status === 404) throw new SyncError('Couldn’t find that sheet or tab. Check the link.')
  if (!res.ok || type.includes('text/html')) throw new SyncError(UNREADABLE)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new SyncError('That tab is over 10 MB.')
  if (!text.trim()) throw new SyncError('That tab is empty.')
  return text
}

async function superAdmin(req: Request, admin: SupabaseClient): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return { ok: false, res: json({ error: 'Sign in first.' }, 401) }
  const { data: auth } = await admin.auth.getUser(jwt)
  if (!auth?.user) return { ok: false, res: json({ error: 'Sign in first.' }, 401) }
  const { data: me } = await admin.from('users').select('is_super_admin').eq('id', auth.user.id).maybeSingle()
  if (!me?.is_super_admin) return { ok: false, res: json({ error: 'Only a Super Admin can run a sync.' }, 403) }
  return { ok: true, userId: auth.user.id }
}

interface DefinitionRow {
  id: string
  name: string
  target_table: string
  match_on: string
  require_column: string | null
  parent_id: string | null
  engine: string
  sync_column_maps: { sheet_column: string; target_column: string | null; value_kind: ColumnMap['valueKind']; transform: ColumnMap['transform']; transform_arg: string | null; reference_table: string | null; sort_order: number }[]
}

/** A definition and its column maps as the engine's plan; the key column of a natural-key table comes from sync_targets. */
function toPlan(d: DefinitionRow, keyOf: Map<string, string>): MappingPlan {
  return {
    name: d.name,
    targetTable: d.target_table,
    keyColumn: d.match_on === 'sheet_id' ? 'sheet_id' : (keyOf.get(d.target_table) ?? 'sheet_id'),
    requireColumn: d.require_column,
    columns: [...d.sync_column_maps]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ sheetColumn: c.sheet_column, targetColumn: c.target_column, valueKind: c.value_kind, transform: c.transform, transformArg: c.transform_arg, referenceTable: c.reference_table })),
  }
}

const DEFINITION_SELECT = 'id, name, target_table, match_on, require_column, parent_id, engine, sync_column_maps(sheet_column, target_column, value_kind, transform, transform_arg, reference_table, sort_order)'

async function targetKeys(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await admin.from('sync_targets').select('table_name, key_column')
  return new Map((data ?? []).map((t: { table_name: string; key_column: string }) => [t.table_name, t.key_column]))
}

async function switchEngine(admin: SupabaseClient, syncId: string, engine: string) {
  if (engine !== 'footprints' && engine !== 'legacy') return json({ error: 'Unknown engine.' }, 400)
  const { data: d } = await admin.from('sync_definitions').select(DEFINITION_SELECT).eq('id', syncId).maybeSingle()
  if (!d) return json({ ok: false, error: 'That mapping doesn’t exist.' })
  if (engine === 'footprints') {
    const def = d as DefinitionRow
    if (def.parent_id) return json({ ok: false, error: 'Mappings that belong to a parent row (like contacts) can’t move yet.' })
    const problem = planProblem(toPlan(def, await targetKeys(admin)))
    if (problem) return json({ ok: false, error: problem })
  }
  const { error } = await admin.from('sync_definitions').update({ engine, active: engine === 'legacy' }).eq('id', syncId)
  if (error) return json({ ok: false, error: error.message })
  return json({ ok: true })
}

interface MappingResult {
  sync_id: string
  name: string
  table: string
  read: number
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  error?: string
  insights?: InvoiceInsights
}

async function syncSource(admin: SupabaseClient, userId: string, sourceId: string, onlySync: string | null, dry: boolean) {
  const { data: source } = await admin.from('sync_sources').select('id, spreadsheet_id, tab_name, header_row, date_order').eq('id', sourceId).maybeSingle()
  if (!source) return json({ ok: false, error: 'That source doesn’t exist.' })
  let query = admin.from('sync_definitions').select(DEFINITION_SELECT).eq('source_id', sourceId).eq('engine', 'footprints')
  if (onlySync) query = query.eq('id', onlySync)
  const { data: defs } = await query
  // Parents before their children.
  const mappings = ((defs ?? []) as DefinitionRow[]).sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id) || a.name.localeCompare(b.name))
  if (!mappings.length) return json({ ok: false, error: 'No mapping here is on the Footprints engine yet.' })

  const keyOf = await targetKeys(admin)
  const { data: settings } = await admin.from('sheet_sync_settings').select('date_order').maybeSingle()
  // A sheet that says how it writes its dates wins over the global setting.
  const order: DateOrder = (source.date_order ?? settings?.date_order) === 'mdy' ? 'mdy' : 'dmy'

  const results: MappingResult[] = []
  const problems: RowProblem[] = []
  let table: string[][]
  try {
    table = parseCsv(await fetchCsv(`https://docs.google.com/spreadsheets/d/${source.spreadsheet_id}/edit`, source.tab_name))
  } catch (e) {
    return json({ ok: false, error: e instanceof SyncError ? e.message : 'Couldn’t read that sheet.' })
  }

  for (const d of mappings) {
    const result: MappingResult = { sync_id: d.id, name: d.name, table: d.target_table, read: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0 }
    results.push(result)
    let runId: string | null = null
    try {
      const plan = toPlan(d, keyOf)
      const problem = planProblem(plan)
      if (problem) throw new SyncError(problem)
      if (!dry) {
        const { data: run } = await admin.from('sync_runs').insert({ sync_id: d.id, source: 'manual', status: 'running', actor_id: userId }).select('id').single()
        runId = run?.id ?? null
      }
      const built = buildRows(table, plan, source.header_row, order)
      if (built.missing.length) throw new SyncError(`The sheet has no column named ${built.missing.map((m) => `“${m}”`).join(', ')}. Check the sheet or the mapping.`)
      problems.push(...built.problems)
      if (d.target_table === 'invoices') {
        // Only active users' sheet IDs count, the same rule the link uses.
        const [{ data: ids }, { data: active }] = await Promise.all([admin.from('user_sheet_ids').select('sheet_id, user_id'), admin.from('users').select('id').eq('status', 'active')])
        const activeIds = new Set((active ?? []).map((u: { id: string }) => u.id))
        result.insights = invoiceInsights(built.rows, new Set((ids ?? []).filter((r: { user_id: string }) => activeIds.has(r.user_id)).map((r: { sheet_id: string }) => r.sheet_id)))
      }
      result.read = built.rows.length + built.skipped
      result.skipped = built.skipped
      for (let i = 0; i < built.rows.length; i += BATCH) {
        const { data, error } = await admin.rpc('sync_engine_apply', { p_sync: d.id, p_rows: built.rows.slice(i, i + BATCH), p_dry: dry })
        if (error) throw new SyncError(error.message)
        const c = data as { inserted: number; updated: number; unchanged: number }
        result.inserted += c.inserted
        result.updated += c.updated
        result.unchanged += c.unchanged
      }
      // Invoices find their salesperson, customer and sale order by sheet ID; rows the engine left unchanged may have had a link arrive since.
      if (!dry && d.target_table === 'invoices') {
        const { error } = await admin.rpc('invoices_relink')
        if (error) throw new SyncError(error.message)
      }
      if (runId) {
        await admin.from('sync_runs').update({ status: 'ok', finished_at: new Date().toISOString(), rows_read: result.read, rows_written: result.inserted + result.updated, rows_skipped: result.skipped }).eq('id', runId)
        await admin.from('sync_definitions').update({ last_run_at: new Date().toISOString() }).eq('id', d.id)
      }
    } catch (e) {
      const message = e instanceof SyncError ? e.message : 'The sync stopped unexpectedly.'
      if (!(e instanceof SyncError)) console.error(e)
      result.error = message
      if (runId) await admin.from('sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), rows_read: result.read, rows_written: result.inserted + result.updated, rows_skipped: result.skipped, message }).eq('id', runId)
    }
  }
  const errors = problems.slice(0, 50)
  return json({ ok: results.every((r) => !r.error), dry, results, errors, more_errors: Math.max(problems.length - errors.length, 0) })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const who = await superAdmin(req, admin)
  if (!who.ok) return who.res

  const body = (await req.json().catch(() => ({}))) as { action?: string; source_id?: string; sync_id?: string; engine?: string }
  if (body.action === 'switch' && body.sync_id) return switchEngine(admin, body.sync_id, body.engine ?? '')
  if ((body.action === 'preview' || body.action === 'run') && body.source_id) return syncSource(admin, who.userId, body.source_id, body.sync_id ?? null, body.action === 'preview')
  return json({ error: 'Unknown action.' }, 400)
})
