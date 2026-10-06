import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, FileSpreadsheet, Loader2, ReceiptText, RefreshCw, ShieldAlert } from 'lucide-react'
import { AdminFrame, AdminGroup, AdminRow } from '@/components/AdminKit'
import { useProfile } from '@/features/auth/useProfile'
import { sheetSyncService } from '@/features/sheetSync/sheetSyncService'
import { countsText, orderCountsText, SCHEDULES, type SheetSyncRun, type SheetSyncSettings } from '@/features/sheetSync/sheetSync'
import { formatTime, timeAgo } from '@/lib/datetime'
import { useLanguage } from '@/i18n/LanguageContext'

/**
 * Data & sync (Admin), laid out like the canvas (Polish › Admin › Data &
 * sync): the syncs that feed the app, the last run's numbers with Preview
 * and Sync now, and recent runs. The full setup (sheet link, columns,
 * schedule) is the sync's details page.
 */
export function DataSyncPage() {
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
  return <DataSync />
}

function DataSync() {
  const { language } = useLanguage()
  const [settings, setSettings] = useState<SheetSyncSettings | null>(null)
  const [runs, setRuns] = useState<SheetSyncRun[]>([])
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([sheetSyncService.get().catch(() => null), sheetSyncService.runs().catch(() => [] as SheetSyncRun[])])
    setSettings(s)
    setRuns(r)
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
  const schedule = SCHEDULES.find((x) => x.value === settings?.schedule)?.label ?? 'Off'
  const lastReal = runs.find((r) => r.trigger !== 'preview' && r.status !== 'running')
  const failed = lastReal?.status === 'failed'

  return (
    <AdminFrame sub="Where data comes from and goes to">
      <AdminGroup title={`Syncs · ${configured ? (settings!.orders ? 2 : 1) : 0}`}>
        <AdminRow
          icon={FileSpreadsheet}
          label="Customers & contacts"
          sub={configured ? `Google Sheet · ${settings!.tabs.length} ${settings!.tabs.length === 1 ? 'tab' : 'tabs'} · ${schedule.toLowerCase()}` : 'Not set up yet'}
          value={settings?.last_synced_at ? timeAgo(settings.last_synced_at, Date.now(), language) : undefined}
          pill={configured ? (failed ? { text: 'Failed', tone: 'danger' } : lastReal ? { text: 'OK', tone: 'ok' } : undefined) : { text: 'Set up', tone: 'brand' }}
          to="/settings/sheet-sync"
        />
        {settings?.orders && (
          <AdminRow
            icon={ReceiptText}
            label="Sale orders"
            sub={`Google Sheet · ${settings.orders.tab ?? 'tab'} · valid orders only · ${schedule.toLowerCase()}`}
            value={lastReal?.orders?.valid !== undefined ? `${lastReal.orders.valid.toLocaleString('en-US')} valid` : undefined}
            to="/settings/sheet-sync"
          />
        )}
      </AdminGroup>

      {configured && (
        <section aria-label="Customers & contacts" className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
          <p className="text-[15px] font-bold text-neutral-900">Customers &amp; contacts</p>
          <p className="text-xs text-neutral-500">Google Sheet · every {schedule.toLowerCase() === 'hourly' ? 'hour' : schedule.toLowerCase()}</p>
          {lastReal && (
            <div className="mt-3 grid grid-cols-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              {[
                [lastReal.rows_read, 'rows read'],
                [lastReal.updated, 'updated'],
                [lastReal.created, 'added'],
                [lastReal.contacts_updated + lastReal.contacts_created, 'contacts'],
              ].map(([n, l], i) => (
                <div key={l as string} className={`min-w-0 px-1.5 ${i ? 'border-l border-neutral-100 dark:border-neutral-800' : 'pl-0'}`}>
                  <p className="truncate text-base font-extrabold text-neutral-900">{(n as number).toLocaleString('en-US')}</p>
                  <p className="text-[11px] text-neutral-500">{l}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={!!busy} onClick={() => go('preview')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-900 disabled:opacity-50">
              {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" aria-hidden />} Preview changes
            </button>
            <button type="button" disabled={!!busy} onClick={() => go('run')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white disabled:opacity-50">
              {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" aria-hidden />} Sync now
            </button>
          </div>
          {message && <p className={`mt-2.5 rounded-xl px-3 py-2 text-[13px] ${message.ok ? 'bg-status-working/10 text-status-working' : 'bg-status-danger/10 text-status-danger'}`}>{message.text}</p>}
          <Link to="/settings/sheet-sync" className="mt-2.5 block text-center text-[13px] font-bold text-brand-500">
            Sync details
          </Link>
        </section>
      )}

      {runs.length > 0 && (
        <AdminGroup title="Recent runs">
          {runs.slice(0, 6).map((r) => (
            <div key={r.id} className="flex items-start gap-3 border-t border-neutral-100 py-2.5 dark:border-neutral-800">
              <span className="w-11 shrink-0 pt-px text-xs font-bold tabular-nums text-neutral-500">{formatTime(r.started_at)}</span>
              <span className="min-w-0 flex-1 text-[13px] text-neutral-900">
                {r.status === 'failed'
                  ? (r.message ?? 'Failed')
                  : r.status === 'running'
                    ? 'Running…'
                    : [`${r.rows_read.toLocaleString('en-US')} read · ${countsText(r, r.trigger === 'preview')}`, orderCountsText(r.orders, r.trigger === 'preview')].filter(Boolean).join(' · ')}
              </span>
              <span
                className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${
                  r.status === 'failed' ? 'bg-status-danger/10 text-status-danger' : r.trigger === 'preview' ? 'bg-neutral-100 text-neutral-600' : 'bg-brand-50 text-brand-700'
                }`}
              >
                {r.status === 'failed' ? 'Failed' : r.trigger === 'preview' ? 'Preview' : 'Sync'}
              </span>
            </div>
          ))}
        </AdminGroup>
      )}
    </AdminFrame>
  )
}
