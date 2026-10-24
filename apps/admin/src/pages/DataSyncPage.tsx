import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import { DataTable, type Column } from '@footprints/shared/components/desktop/DataTable'
import { countsText, orderCountsText, scheduleText, SCHEDULES, type SheetSyncRun, type SheetSyncSettings } from '@footprints/shared/features/sheetSync/sheetSync'
import { sheetSyncService } from '@footprints/shared/features/sheetSync/sheetSyncService'
import { formatTime } from '@footprints/shared/lib/datetime'
import { Notice, PrimaryButton, SecondaryButton } from '@/components/form'
import { SourcesTab } from '@/features/sync/SourcesTab'

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

const TABS = [
  ['overview', 'Overview'],
  ['sources', 'Sources'],
] as const

export function DataSyncPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'sources' ? 'sources' : 'overview'
  const [settings, setSettings] = useState<SheetSyncSettings | null>(null)
  const [runs, setRuns] = useState<SheetSyncRun[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, r] = await Promise.allSettled([sheetSyncService.get(), sheetSyncService.runs()])
    setSettings(s.status === 'fulfilled' ? s.value : null)
    setRuns(r.status === 'fulfilled' ? r.value : [])
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

      <div role="tablist" className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'overview' ? {} : { tab: key })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key ? 'border-brand-500 text-brand-500' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sources' ? (
        <SourcesTab />
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
