import { useCallback, useEffect, useState } from 'react'
import { Eye, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import { DataTable, type Column } from '@footprints/shared/components/desktop/DataTable'
import { countsText, orderCountsText, scheduleText, SCHEDULES, type SheetSyncRun, type SheetSyncSettings } from '@footprints/shared/features/sheetSync/sheetSync'
import { sheetSyncService } from '@footprints/shared/features/sheetSync/sheetSyncService'
import { formatTime } from '@footprints/shared/lib/datetime'
import { Notice, PrimaryButton, SecondaryButton } from '@/components/form'
import { groupBySheet, listLegacyDefinitions, type SheetGroup } from '@/features/sync/legacySyncs'

const RUN_COLUMNS: Column<SheetSyncRun>[] = [
  { key: 'when', header: 'When', sortValue: (r) => r.started_at, cell: (r) => <span className="tabular-nums">{new Date(r.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
  { key: 'kind', header: 'Run', cell: (r) => <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-600">{r.trigger === 'preview' ? 'Preview' : r.trigger === 'schedule' ? 'Scheduled' : 'Manual'}</span> },
  {
    key: 'status',
    header: 'Result',
    cell: (r) => (
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.status === 'failed' ? 'bg-status-danger/10 text-status-danger' : r.status === 'partial' ? 'bg-status-warn/10 text-status-warn' : r.status === 'running' ? 'bg-neutral-100 text-neutral-600' : 'bg-status-working/10 text-status-working'}`}>
        {r.status === 'ok' ? 'OK' : r.status === 'partial' ? 'With problems' : r.status === 'running' ? 'Running' : 'Failed'}
      </span>
    ),
  },
  {
    key: 'summary',
    header: 'Summary',
    cell: (r) =>
      r.status === 'failed' ? (
        <span className="text-status-danger">{r.message ?? 'Failed'}</span>
      ) : (
        <span className="text-neutral-600">{[`${r.rows_read.toLocaleString('en-US')} read · ${countsText(r, r.trigger === 'preview')}`, orderCountsText(r.orders, r.trigger === 'preview')].filter(Boolean).join(' · ')}</span>
      ),
  },
]

function agoText(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function DataSyncPage() {
  const [settings, setSettings] = useState<SheetSyncSettings | null>(null)
  const [runs, setRuns] = useState<SheetSyncRun[]>([])
  const [groups, setGroups] = useState<SheetGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, r, defs] = await Promise.allSettled([sheetSyncService.get(), sheetSyncService.runs(), listLegacyDefinitions()])
    setSettings(s.status === 'fulfilled' ? s.value : null)
    setRuns(r.status === 'fulfilled' ? r.value : [])
    setGroups(defs.status === 'fulfilled' ? groupBySheet(defs.value) : [])
    setLoadError(s.status === 'rejected' ? (s.reason instanceof Error ? s.reason.message : 'Couldn’t load the sync.') : null)
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function go(kind: 'preview' | 'run') {
    setBusy(kind)
    setMessage(null)
    try {
      const res = kind === 'preview' ? await sheetSyncService.preview() : await sheetSyncService.run()
      setMessage(res.ok && res.counts ? { ok: true, text: [countsText(res.counts, kind === 'preview'), orderCountsText(res.counts.orders, kind === 'preview')].filter(Boolean).join(' · ') } : { ok: false, text: res.error ?? 'The sync didn’t finish.' })
      await load()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'The sync didn’t finish.' })
    } finally {
      setBusy(null)
    }
  }

  const configured = !!settings && (settings.tabs.length > 0 || !!settings.orders)
  const lastReal = runs.find((r) => r.trigger !== 'preview' && r.status !== 'running')

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Data sync</h1>
        <p className="mt-1 text-sm text-neutral-500">Where data comes from and which tables it goes to</p>
      </header>

      {loadError && <Notice tone="error">{loadError}</Notice>}

      <section aria-label="Google Sheet sync" className="space-y-3">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-neutral-500">Running now</h2>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 text-brand-500" aria-hidden />
              <div>
                <p className="text-base font-bold text-neutral-900 dark:text-neutral-50">Customers, contacts &amp; sale orders</p>
                {loading ? (
                  <p className="text-sm text-neutral-500">Loading…</p>
                ) : configured ? (
                  <p className="text-sm text-neutral-500">
                    {settings!.tabs.length} customer {settings!.tabs.length === 1 ? 'tab' : 'tabs'}
                    {settings!.orders ? ' + sale orders' : ''} · {SCHEDULES.find((x) => x.value === settings!.schedule)?.label ?? 'Off'}: {scheduleText(settings!)}
                    {settings!.last_synced_at && ` · last synced ${formatTime(settings!.last_synced_at)} on ${agoText(settings!.last_synced_at)}`}
                  </p>
                ) : (
                  <p className="text-sm text-neutral-500">Not set up yet.</p>
                )}
              </div>
            </div>
            {configured && (
              <div className="flex gap-2">
                <SecondaryButton disabled={!!busy} onClick={() => void go('preview')}>
                  <span className="inline-flex items-center gap-1.5">{busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" aria-hidden />}Preview changes</span>
                </SecondaryButton>
                <PrimaryButton disabled={!!busy} onClick={() => void go('run')}>
                  <span className="inline-flex items-center gap-1.5">{busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" aria-hidden />}Sync now</span>
                </PrimaryButton>
              </div>
            )}
          </div>
          {lastReal && (
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-4 dark:border-neutral-800">
              {[
                [lastReal.rows_read, 'rows read'],
                [lastReal.updated, 'customers updated'],
                [lastReal.created, 'customers added'],
                [lastReal.contacts_updated + lastReal.contacts_created, 'contacts changed'],
              ].map(([n, l]) => (
                <div key={l as string}>
                  <dd className="text-xl font-extrabold text-neutral-900 dark:text-neutral-50">{(n as number).toLocaleString('en-US')}</dd>
                  <dt className="text-xs text-neutral-500">{l}</dt>
                </div>
              ))}
            </dl>
          )}
          {message && <div className="mt-4"><Notice tone={message.ok ? 'ok' : 'error'}>{message.text}</Notice></div>}
        </div>
      </section>

      <section aria-label="Recent runs" className="space-y-3">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-neutral-500">Recent runs</h2>
        <DataTable columns={RUN_COLUMNS} rows={runs} rowKey={(r) => r.id} loading={loading} empty="No runs yet." />
      </section>

      <section aria-label="Sheets and the tables they feed" className="space-y-3">
        <div>
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-neutral-500">Sheets and the tables they feed</h2>
          <p className="mt-1 text-xs text-neutral-500">
            The older sync definitions, read-only. Footprints doesn’t run these on a schedule; each was last run by hand. One sheet tab can feed several tables.
          </p>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-neutral-500">{loading ? 'Loading…' : 'No older definitions.'}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((g) => (
              <div key={g.key} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-sm font-bold text-neutral-900 dark:text-neutral-50">Tab “{g.tabName}”</p>
                <ul className="mt-2 space-y-1.5">
                  {g.mappings.map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                        {m.name} <span className="text-neutral-400">→</span> <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-800">{m.targetTable}</code>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">{m.lastRunAt ? `last run ${agoText(m.lastRunAt)}` : 'never run'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
