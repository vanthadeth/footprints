import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, FileSpreadsheet, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { AdminFrame, AdminGroup, AdminRow } from '@footprints/shared/components/AdminKit'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { sheetSyncService } from '@footprints/shared/features/sheetSync/sheetSyncService'
import { countsText, orderCountsText, SCHEDULES, type SheetSyncRun, type SheetSyncSettings } from '@footprints/shared/features/sheetSync/sheetSync'
import { groupSources, sourceChip, targetsText, type ChipTone } from '@footprints/shared/features/sourceSync/sourceGroups'
import { listSources, type Source } from '@footprints/shared/features/sourceSync/sources'
import { formatTime } from '@footprints/shared/lib/datetime'

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

const CHIP_TONE: Record<ChipTone, 'ok' | 'warn' | 'plain'> = { ok: 'ok', warn: 'warn', neutral: 'plain' }

function DataSync() {
  const [settings, setSettings] = useState<SheetSyncSettings | null>(null)
  const [runs, setRuns] = useState<SheetSyncRun[]>([])
  const [sources, setSources] = useState<Source[] | null>(null)
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([sheetSyncService.get().catch(() => null), sheetSyncService.runs().catch(() => [] as SheetSyncRun[])])
    setSettings(s)
    setRuns(r)
    setSources(await listSources().catch(() => []))
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
      {configured && (
        <section aria-label="Customers & contacts" className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-50 text-brand-700"><FileSpreadsheet className="h-[22px] w-[22px]" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold leading-[21px] text-neutral-900">Customers, contacts &amp; sale orders</p>
              <p className="text-[13px] text-neutral-500">
                {schedule === 'Hourly' ? 'Every hour' : schedule}
                {settings?.last_synced_at ? ` · last synced ${formatTime(settings.last_synced_at)} on ${new Date(settings.last_synced_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </div>
            {lastReal && (
              <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-bold ${failed ? 'bg-status-danger/10 text-status-danger' : 'bg-status-working/10 text-status-working'}`}>{failed ? 'Failed' : 'OK'}</span>
            )}
          </div>
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

      {sources === null && <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />}
      {sources && groupSources(sources).map((g) => (
        <AdminGroup key={g.key} title={g.title} note={g.key === 'engine' ? 'New' : undefined}>
          {g.sources.map((s) => {
            const chip = sourceChip(s)
            return <AdminRow key={s.id} icon={FileSpreadsheet} label={s.tabName} sub={targetsText(s)} pill={{ text: chip.text, tone: CHIP_TONE[chip.tone] }} to={`/admin/sync/${s.id}`} />
          })}
        </AdminGroup>
      ))}

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
