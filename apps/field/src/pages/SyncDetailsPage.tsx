import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Eye, ExternalLink, FileSpreadsheet, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { AdminFrame, AdminGroup, AdminTabs } from '@footprints/shared/components/AdminKit'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { sourceChip, targetsText, type ChipTone } from '@footprints/shared/features/sourceSync/sourceGroups'
import { sourceSync, type InvoiceInsights, type MappingRun, type SourceSyncResult } from '@footprints/shared/features/sourceSync/sourceSync'
import { cadenceText, listSources, sheetUrl, type Mapping, type Source } from '@footprints/shared/features/sourceSync/sources'

const n = (x: number) => x.toLocaleString('en-US')

const CHIP: Record<ChipTone, string> = {
  ok: 'bg-status-working/10 text-status-working',
  warn: 'bg-status-warn/10 text-status-warn',
  neutral: 'bg-neutral-100 text-neutral-600',
}

type Tab = 'preview' | 'columns' | 'runs'
const TABS: [Tab, string][] = [['preview', 'Preview'], ['columns', 'Columns'], ['runs', 'Runs']]

/**
 * One sync source (a sheet tab and the tables it feeds), laid out like the canvas (Data sync › Sync
 * details): what it is, Preview changes / Sync now, then tabs for the preview or last run, the column
 * map, and the run history. Super Admin only, like the list.
 */
export function SyncDetailsPage() {
  const { profile, loading } = useProfile()
  if (loading) return <div className="mx-auto mt-4 h-40 max-w-lg animate-pulse rounded-2xl bg-neutral-100" />
  if (!profile?.is_super_admin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center">
        <ShieldAlert className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Only a Super Admin can open Data &amp; sync.</p>
      </div>
    )
  }
  return <SyncDetails />
}

function SyncDetails() {
  const { sourceId = '' } = useParams()
  const [source, setSource] = useState<Source | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('preview')
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [result, setResult] = useState<SourceSyncResult | null>(null)
  const [runs, setRuns] = useState<MappingRun[] | null>(null)

  const load = useCallback(async () => {
    try {
      const s = (await listSources()).find((x) => x.id === sourceId) ?? null
      if (!s) setError('That source doesn’t exist.')
      setSource(s)
      setRuns(s ? await sourceSync.runs(s.mappings.map((m) => m.id)).catch(() => []) : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the source.')
    }
  }, [sourceId])
  useEffect(() => {
    void load()
  }, [load])

  async function go(kind: 'preview' | 'run') {
    setBusy(kind)
    setTab('preview')
    try {
      setResult(await sourceSync.sync(kind, sourceId))
      if (kind === 'run') await load()
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'The sync didn’t finish.' })
    } finally {
      setBusy(null)
    }
  }

  if (error && !source) return <AdminFrame><p className="rounded-xl bg-status-danger/10 px-3 py-2.5 text-sm text-status-danger">{error}</p></AdminFrame>
  if (!source) return <div className="mx-auto mt-4 h-40 max-w-lg animate-pulse rounded-2xl bg-neutral-100" />

  const chip = sourceChip(source)
  const moved = source.mappings.filter((m) => m.engine === 'footprints')

  return (
    <AdminFrame>
      <div className="flex items-center gap-3.5 px-0.5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" aria-hidden="true">
          <FileSpreadsheet className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-6 text-neutral-900">{source.tabName}</h1>
          <p className="truncate text-sm text-neutral-500">{targetsText(source)}</p>
          <span className={`mt-1.5 inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${CHIP[chip.tone]}`}>{chip.text}</span>
        </div>
      </div>

      <section aria-label="Source" className="rounded-2xl border border-neutral-100 bg-white px-3.5 shadow-card">
        <Fact label="Sheet">
          <a href={sheetUrl(source.spreadsheetId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-500">
            tab {source.tabName} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </Fact>
        <Fact label="Header row">{source.headerRow}</Fact>
        <Fact label="Mappings">{source.mappings.length} · {moved.length ? `${moved.length} on the Footprints engine` : 'all on the older runner'}</Fact>
        <Fact label="Runs">{moved.length ? 'When you press Sync now' : source.mappings[0] ? cadenceText(source.mappings[0]) : '—'}</Fact>
      </section>

      {moved.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!!busy} onClick={() => void go('preview')} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-900 disabled:opacity-50">
            {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" aria-hidden />} Preview changes
          </button>
          <button type="button" disabled={!!busy} onClick={() => void go('run')} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white disabled:opacity-50">
            {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" aria-hidden />} Sync now
          </button>
        </div>
      ) : (
        <p className="rounded-xl bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-600">This tab still syncs on the older runner, on its schedule. Preview and Sync now appear once a mapping moves to the Footprints engine.</p>
      )}

      <AdminTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'preview' && <PreviewTab result={result} busy={busy} source={source} />}
      {tab === 'columns' && <ColumnsTab source={source} />}
      {tab === 'runs' && <RunsTab runs={runs} source={source} />}
    </AdminFrame>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-neutral-100 py-3 text-sm first:border-t-0 dark:border-neutral-800">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 text-right font-semibold text-neutral-900">{children}</span>
    </div>
  )
}

const STATUS: [string, string, string][] = [
  ['5', 'Submitted', 'bg-status-working'],
  ['9', 'Void', 'bg-status-danger'],
  ['0', 'Draft', 'bg-status-warn'],
  ['other', 'Other', 'bg-neutral-400'],
]

function PreviewTab({ result, busy, source }: { result: SourceSyncResult | null; busy: 'preview' | 'run' | null; source: Source }) {
  if (busy) return <p className="py-6 text-center text-sm text-neutral-500">{busy === 'preview' ? 'Reading the sheet…' : 'Syncing…'}</p>
  if (!result) {
    return (
      <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-8 text-center shadow-card">
        <p className="text-[15px] font-bold text-neutral-900">No preview yet</p>
        <p className="mt-1 text-[13px] text-neutral-500">Press Preview changes to see what a sync would do. Nothing is written until you press Sync now.</p>
      </div>
    )
  }
  const dry = !!result.dry
  const rows = result.results ?? []
  const sum = (f: (r: NonNullable<SourceSyncResult['results']>[number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  const problems = (result.errors?.length ?? 0) + (result.more_errors ?? 0)
  const insights = rows.map((r) => r.insights).find((i): i is InvoiceInsights => !!i)
  const invoices = source.mappings.some((m: Mapping) => m.targetTable === 'invoices')
  const statusTotal = insights ? Object.values(insights.status).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="space-y-4">
      <AdminGroup title={dry ? 'Preview · nothing changed yet' : 'Synced'}>
        {result.error && <p className="my-2 rounded-xl bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">{result.error}</p>}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-100 my-3">
            {[
              [sum((r) => r.read), 'rows read'],
              [sum((r) => r.inserted), dry ? 'to add' : 'added'],
              [sum((r) => r.updated), dry ? 'to update' : 'updated'],
              [problems, problems === 1 ? 'problem in the sheet' : 'problems in the sheet'],
            ].map(([v, l]) => (
              <div key={l as string} className="bg-white px-3.5 py-3">
                <p className="text-[22px] font-extrabold leading-7 text-neutral-900">{n(v as number)}</p>
                <p className="text-xs text-neutral-500">{l}</p>
              </div>
            ))}
          </div>
        )}
        {rows.map((r) => (
          <p key={r.sync_id} className="border-t border-neutral-100 py-2.5 text-[13px] text-neutral-600 first:border-t-0 dark:border-neutral-800">
            <span className="font-semibold text-neutral-900">{r.name}</span> → <code className="text-xs">{r.table}</code>
            {r.error ? <span className="block text-status-danger">{r.error}</span> : <span className="block">{n(r.read)} rows · {n(r.unchanged)} already up to date{r.skipped ? ` · ${n(r.skipped)} skipped` : ''}</span>}
          </p>
        ))}
        {insights && statusTotal > 0 && (
          <div className="py-3">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={STATUS.filter(([k]) => insights.status[k]).map(([k, l]) => `${n(insights.status[k])} ${l.toLowerCase()}`).join(', ')}>
              {STATUS.filter(([k]) => insights.status[k]).map(([k, , cls]) => (
                <span key={k} className={cls} style={{ width: `${(insights.status[k] / statusTotal) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[13px]">
              {STATUS.filter(([k]) => insights.status[k]).map(([k, l, cls]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${cls}`} />
                  <span className="text-neutral-700">{l}</span>
                  <b className="ml-auto text-neutral-900">{n(insights.status[k])}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminGroup>

      {(insights || invoices || problems > 0) && (
        <AdminGroup title="Needs attention">
          {insights && insights.unassignedTotal > 0 && (
            <Attention tone="warn" title={`${n(insights.unassignedTotal)} invoices have no salesperson`}>
              Their ASSIGN_TO is not a Google Sheet ID of an active user. Add the ID to a user, then sync again.
              <ul className="mt-1.5">
                {insights.unassigned.map((u) => (
                  <li key={u.id} className="flex justify-between border-t border-dashed border-neutral-200 py-1 text-xs dark:border-neutral-700">
                    <code className="text-neutral-900">{u.id}</code>
                    <span>{n(u.count)} {u.count === 1 ? 'invoice' : 'invoices'}</span>
                  </li>
                ))}
              </ul>
            </Attention>
          )}
          {insights && insights.noSaleOrder > 0 && (
            <Attention tone="info" title={`${n(insights.noSaleOrder)} invoices have no sale order`}>Imported without a link to a sale order. Nothing to fix.</Attention>
          )}
          {invoices && (
            <Attention tone="ok" title="Due date comes from the payment term">Invoice date plus the term’s latest period. The sheet’s own DUE_DATE is not used.</Attention>
          )}
          {problems > 0 && (
            <Attention tone="warn" title={`${n(problems)} ${problems === 1 ? 'problem' : 'problems'} in the sheet`}>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {result.errors?.slice(0, 8).map((e, i) => (
                  <li key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.reason}</li>
                ))}
                {problems > 8 && <li>…and {n(problems - 8)} more</li>}
              </ul>
            </Attention>
          )}
        </AdminGroup>
      )}
    </div>
  )
}

const ATTENTION_DOT: Record<'warn' | 'info' | 'ok', string> = {
  warn: 'bg-status-warn',
  info: 'bg-brand-500',
  ok: 'bg-status-working',
}

function Attention({ tone, title, children }: { tone: 'warn' | 'info' | 'ok'; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-800">
      <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${ATTENTION_DOT[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold leading-5 text-neutral-900">{title}</p>
        <div className="mt-0.5 text-[12.5px] leading-[17px] text-neutral-500">{children}</div>
      </div>
    </div>
  )
}

function ColumnsTab({ source }: { source: Source }) {
  const [all, setAll] = useState(false)
  return (
    <div className="space-y-4">
      {source.mappings.map((m) => {
        const mapped = m.columns.filter((c) => c.targetColumn)
        const ignored = m.columns.filter((c) => !c.targetColumn)
        const shown = all ? mapped : mapped.slice(0, 9)
        return (
          <div key={m.id} className="space-y-3">
            <AdminGroup title={`${m.name} → ${m.targetTable}`} note={`${mapped.length} columns`}>
              {mapped.length === 0 && <p className="py-3 text-[13px] text-neutral-500">No columns are mapped yet.</p>}
              {shown.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_16px_1fr] items-center gap-2 border-t border-neutral-100 py-2.5 text-[13px] first:border-t-0 dark:border-neutral-800">
                  <code className="min-w-0 truncate text-xs text-neutral-900">{c.sheetColumn}</code>
                  <span className="text-neutral-400" aria-hidden>→</span>
                  <span className="min-w-0 truncate"><code className="text-xs text-neutral-900">{c.targetColumn}</code> <span className="text-[11px] text-neutral-500">{c.referenceTable ? `→ ${c.referenceTable}` : c.valueKind === 'text' ? '' : c.valueKind}</span></span>
                </div>
              ))}
              {mapped.length > shown.length && (
                <button type="button" onClick={() => setAll(true)} className="h-11 w-full text-sm font-bold text-brand-500">Show the other {mapped.length - shown.length} columns</button>
              )}
            </AdminGroup>
            {ignored.length > 0 && (
              <AdminGroup title="Not synced">
                {ignored.map((c) => (
                  <p key={c.id} className="border-t border-neutral-100 py-2.5 text-[13px] text-neutral-500 first:border-t-0 dark:border-neutral-800"><code className="text-xs text-neutral-700">{c.sheetColumn}</code></p>
                ))}
              </AdminGroup>
            )}
          </div>
        )
      })}
    </div>
  )
}

const RUN_CHIP: Record<MappingRun['status'], [string, string]> = {
  ok: ['OK', 'bg-status-working/10 text-status-working'],
  failed: ['Failed', 'bg-status-danger/10 text-status-danger'],
  running: ['Running', 'bg-neutral-100 text-neutral-600'],
}

function RunsTab({ runs, source }: { runs: MappingRun[] | null; source: Source }) {
  if (!runs) return <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
  if (!runs.length) {
    return (
      <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-8 text-center shadow-card">
        <p className="text-[15px] font-bold text-neutral-900">No runs yet</p>
        <p className="mt-1 text-[13px] text-neutral-500">Runs are listed here once a sync has written data. A preview records no run.</p>
      </div>
    )
  }
  const names = new Map(source.mappings.map((m) => [m.id, m.name]))
  return (
    <AdminGroup title="Recent runs">
      {runs.map((r) => (
        <div key={r.id} className="flex items-start gap-3 border-t border-neutral-100 py-2.5 first:border-t-0 dark:border-neutral-800">
          <span className="w-16 shrink-0 pt-px text-xs font-bold tabular-nums text-neutral-500">{new Date(r.startedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="min-w-0 flex-1 text-[13px] text-neutral-900">
            <span className="font-semibold">{names.get(r.syncId) ?? 'Mapping'}</span>
            <span className="block text-neutral-600">{r.status === 'failed' ? (r.message ?? 'Failed') : `${n(r.rowsRead)} read · ${n(r.rowsWritten)} written${r.rowsSkipped ? ` · ${n(r.rowsSkipped)} skipped` : ''}`}</span>
          </span>
          <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${RUN_CHIP[r.status][1]}`}>{RUN_CHIP[r.status][0]}</span>
        </div>
      ))}
    </AdminGroup>
  )
}
