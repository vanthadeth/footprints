// Footprints: Google Sheet sync for customers and sale orders (Super Admin).
//
// Reads one to three tabs of a Google Sheet shared as "Anyone with the link
// can view" (CSV export), maps the columns the Super Admin chose to customer
// fields, merges the rows by key and hands them to the sheet_sync_* RPCs
// (supabase/migrations/0105_footprints_sheet_sync.sql), which do the writes.
// Then, when set, reads the sale order tab (fixed SO columns) and mirrors it
// into sale_orders through sheet_orders_apply (0107).
//
// Actions (POST JSON):
//   { action: 'headers', url, tab? } -> the tab's headers, a sample and suggested mapping
//   { action: 'preview' }       -> what a sync would change (rolled back)
//   { action: 'run' }           -> sync now (the only action with the token, besides preview)
//
// Who may call: a signed-in Super Admin (Authorization: Bearer <user JWT>),
// or the sheet-sync cron job with the x-sheet-sync-token header (checked
// against the Vault secret by sheet_sync_token_ok). Deployed with
// verify_jwt = false because the cron call carries no user JWT.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { gidForTab, isValidOrder, linkGid, mapOrders, mapTab, mergeRows, parseCsv, resolveAssignee, resolveProvince, resolveUser, sheetCsvUrl, sheetId, suggestMapping, type DateOrder, type MappedRow, type RowProblem, type TabConfig } from './parse.ts'

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

/** The gid of a named tab, read from the sheet's htmlview page (shared sheets only). */
async function tabGid(url: string, tab: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId(url)}/htmlview`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new SyncError('Couldn’t reach Google Sheets. Try again in a minute.')
  }
  if (res.status === 404) throw new SyncError('Couldn’t find that sheet. Check the link.')
  if (!res.ok) throw new SyncError('The sheet isn’t shared as “Anyone with the link can view”. Change its sharing in Google Sheets, then try again.')
  const gid = gidForTab(await res.text(), tab)
  if (!gid) throw new SyncError(`Couldn’t find a tab named “${tab.trim()}”. Check the name, or open the tab and copy its link instead.`)
  return gid
}

async function fetchCsv(url: string, tab?: string | null): Promise<string> {
  if (!sheetId(url)) throw new SyncError('That isn’t a Google Sheets link (docs.google.com/spreadsheets/d/…).')
  const gid = !linkGid(url) && tab?.trim() ? await tabGid(url, tab) : null
  const csvUrl = sheetCsvUrl(url, gid)!
  let res: Response
  try {
    res = await fetch(csvUrl, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new SyncError('Couldn’t reach Google Sheets. Try again in a minute.')
  }
  const type = res.headers.get('content-type') ?? ''
  if (res.status === 404) throw new SyncError('Couldn’t find that sheet or tab. Check the link.')
  if (!res.ok || type.includes('text/html')) throw new SyncError('The sheet isn’t shared as “Anyone with the link can view”. Change its sharing in Google Sheets, then try again.')
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new SyncError('That tab is over 10 MB. Sync a smaller tab.')
  if (!text.trim()) throw new SyncError('That tab is empty.')
  return text
}

async function caller(req: Request, admin: SupabaseClient): Promise<{ ok: true; userId: string | null; schedule: boolean } | { ok: false; res: Response }> {
  const token = req.headers.get('x-sheet-sync-token')
  if (token) {
    const { data } = await admin.rpc('sheet_sync_token_ok', { p_token: token })
    return data === true ? { ok: true, userId: null, schedule: true } : { ok: false, res: json({ error: 'Not allowed.' }, 401) }
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return { ok: false, res: json({ error: 'Sign in first.' }, 401) }
  const { data: auth } = await admin.auth.getUser(jwt)
  if (!auth?.user) return { ok: false, res: json({ error: 'Sign in first.' }, 401) }
  const { data: me } = await admin.from('users').select('is_super_admin').eq('id', auth.user.id).maybeSingle()
  if (!me?.is_super_admin) return { ok: false, res: json({ error: 'Only a Super Admin can sync the Google Sheet.' }, 403) }
  return { ok: true, userId: auth.user.id, schedule: false }
}

/** Parsed rows -> the shape sheet_sync_apply expects, resolving province and salesperson. */
function toPayload(
  rows: MappedRow[],
  provinces: { code: string; name: string; name_alt: string | null }[],
  users: { id: string; full_name: string | null; nickname: string | null; email: string | null }[],
  warn: (reason: string) => void,
) {
  const unknownPeople = new Set<string>()
  const out = rows.map((r) => {
    const province_code = resolveProvince(r.province, provinces)
    const owner_id = resolveUser(r.salesperson, users)
    if (r.salesperson && !owner_id) unknownPeople.add(r.salesperson)
    return {
      key: r.key,
      matches: r.matches,
      shop_name: r.shop_name ?? null,
      code: r.code ?? null,
      business_type: r.business_type ?? null,
      contact_name: r.contact_name ?? null,
      phone: r.phone ?? null,
      province_code,
      province_text: province_code ? null : r.province ?? null,
      district: r.district ?? null,
      commune: r.commune ?? null,
      street_address: r.street_address ?? null,
      landmark: r.landmark ?? null,
      zipcode: r.zipcode ?? null,
      remarks: r.remarks ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      credit_limit: r.credit_limit ?? null,
      owner_id,
      last_purchase_date: r.last_purchase_date ?? null,
      balance_usd: r.balance_usd ?? null,
      contacts: r.matches === 'sheet_id' ? r.contacts ?? [] : [],
    }
  })
  for (const p of [...unknownPeople].slice(0, 10)) warn(`Salesperson “${p}” doesn’t match one active user, so those customers keep their owner`)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const who = await caller(req, admin)
  if (!who.ok) return who.res

  const body = (await req.json().catch(() => ({}))) as { action?: string; url?: string; tab?: string }
  // The token caller (cron) runs the sync; it may ask for a preview instead, never headers.
  const action = who.schedule ? (body.action === 'preview' ? 'preview' : 'run') : body.action

  if (action === 'headers') {
    try {
      const rows = parseCsv(await fetchCsv(body.url ?? '', body.tab))
      const headers = (rows[0] ?? []).map((h) => h.trim())
      return json({ ok: true, headers, sample: rows.slice(1, 6), rows: Math.max(rows.length - 1, 0), suggested: suggestMapping(headers) })
    } catch (e) {
      return json({ ok: false, error: e instanceof SyncError ? e.message : 'Couldn’t read that sheet.' })
    }
  }
  if (action !== 'preview' && action !== 'run') return json({ error: 'Unknown action.' }, 400)

  const trigger = action === 'preview' ? 'preview' : who.schedule ? 'schedule' : 'manual'
  const { data: begun, error: beginError } = await admin.rpc('sheet_sync_begin', { p_trigger: trigger, p_user: who.userId })
  if (beginError) return json({ ok: false, error: beginError.details || beginError.message })
  const { run_id: runId, tabs, orders: orderTab, date_order: order } = begun as { run_id: string; tabs: TabConfig[]; orders: { url: string; tab: string | null } | null; date_order: DateOrder }

  const problems: RowProblem[] = []
  const counts = {
    rows_read: 0, updated: 0, created: 0, unchanged: 0, skipped: 0, contacts_updated: 0, contacts_created: 0,
    orders: { read: 0, valid: 0, created: 0, updated: 0, unchanged: 0, cancelled: 0, skipped: 0 },
  }
  try {
    const mapped: { rows: MappedRow[]; balanceRows?: 'total' | 'sum' }[] = []
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]
      const out = mapTab(parseCsv(await fetchCsv(tab.url, tab.tab)), tab, i + 1, order)
      if (out.missing.length) throw new SyncError(`Tab ${i + 1} has no column named ${out.missing.map((m) => `“${m}”`).join(', ')}. Check the sheet or the mapping.`)
      counts.rows_read += out.rows.length
      problems.push(...out.problems)
      mapped.push({ rows: out.rows, balanceRows: tab.balance_rows })
    }
    const merged = mergeRows(mapped)

    const [{ data: provinces }, { data: activeUsers }] = await Promise.all([
      admin.from('geo_provinces').select('code, name, name_alt'),
      admin.from('users').select('id, full_name, nickname, email').eq('status', 'active'),
    ])
    const users = activeUsers ?? []
    const payload = toPayload(merged, provinces ?? [], users, (reason) => problems.push({ tab: 0, row: 0, reason }))

    for (let i = 0; i < payload.length; i += BATCH) {
      const { data, error } = await admin.rpc('sheet_sync_apply', { p_run: runId, p_rows: payload.slice(i, i + BATCH), p_dry: action === 'preview' })
      if (error) throw new SyncError(error.details || error.message)
      const c = data as { updated: number; created: number; unchanged: number; skipped: number; contacts_updated: number; contacts_created: number; skipped_rows: { key: string; reason: string }[] }
      counts.updated += c.updated
      counts.contacts_updated += c.contacts_updated ?? 0
      counts.contacts_created += c.contacts_created ?? 0
      counts.created += c.created
      counts.unchanged += c.unchanged
      counts.skipped += c.skipped
      for (const s of c.skipped_rows) problems.push({ tab: 0, row: 0, reason: `${s.key}: ${s.reason}` })
    }

    // Sale orders, after customers so an order can find a customer this run created.
    if (orderTab) {
      const out = mapOrders(parseCsv(await fetchCsv(orderTab.url, orderTab.tab)), order)
      if (out.missing.length) throw new SyncError(`The sale order tab has no column named ${out.missing.map((m) => `“${m}”`).join(', ')}. Check the sheet.`)
      for (const p of out.problems) problems.push({ tab: 0, row: 0, reason: `Sale orders, row ${p.row}: ${p.reason}` })
      counts.orders.read = out.rows.length
      const unknownPeople = new Set<string>()
      const rows = out.rows.map(({ assign_to, ...r }) => {
        const user_id = resolveAssignee(assign_to, users)
        if (assign_to && !user_id && isValidOrder(r)) unknownPeople.add(assign_to)
        return { ...r, assign_to, user_id }
      })
      for (const p of [...unknownPeople].slice(0, 10)) problems.push({ tab: 0, row: 0, reason: `ASSIGN_TO “${p}” doesn’t name an active user, so those orders keep their salesperson` })
      for (let i = 0; i < rows.length; i += BATCH) {
        const { data, error } = await admin.rpc('sheet_orders_apply', { p_run: runId, p_rows: rows.slice(i, i + BATCH), p_dry: action === 'preview' })
        if (error) throw new SyncError(error.details || error.message)
        const c = data as { valid: number; created: number; updated: number; unchanged: number; cancelled: number; skipped: number; skipped_rows: { key: string; reason: string }[] }
        counts.orders.valid += c.valid
        counts.orders.created += c.created
        counts.orders.updated += c.updated
        counts.orders.unchanged += c.unchanged
        counts.orders.cancelled += c.cancelled
        counts.orders.skipped += c.skipped
        for (const s of c.skipped_rows) problems.push({ tab: 0, row: 0, reason: `Order ${s.key}: ${s.reason}` })
      }
    }

    const status = problems.length ? 'partial' : 'ok'
    const errors = problems.slice(0, 50)
    await admin.rpc('sheet_sync_finish', { p_run: runId, p_status: status, p_counts: counts, p_errors: errors, p_message: null })
    return json({ ok: true, run_id: runId, status, counts, errors, more_errors: Math.max(problems.length - errors.length, 0) })
  } catch (e) {
    const message = e instanceof SyncError ? e.message : 'The sync stopped unexpectedly. Nothing after the last saved batch was changed.'
    if (!(e instanceof SyncError)) console.error(e)
    await admin.rpc('sheet_sync_finish', { p_run: runId, p_status: 'failed', p_counts: counts, p_errors: problems.slice(0, 50), p_message: message })
    return json({ ok: false, run_id: runId, error: message, counts })
  }
})
