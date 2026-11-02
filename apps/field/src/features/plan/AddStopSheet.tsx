import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, Search } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { coverageService, type CoverageRow } from '@/features/customers/coverageService'
import { lastVisitLabel } from '@/features/customers/coverage'
import { formatDistance } from '@footprints/shared/lib/geo'

const CHIP = { overdue: 'bg-status-danger/10 text-status-danger', due: 'bg-status-warn/10 text-status-warn', ok: 'bg-status-working/10 text-status-working' } as const

/**
 * Pick a customer to add to the plan, as on the canvas (Plan › add stop):
 * nearest first until you type, then a name/code search across every
 * customer you can see. Each row shows how long since the last visit and a
 * round add button (a check once it is on the plan).
 */
export function AddStopSheet({
  open,
  onClose,
  here,
  plannedIds,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  here: { lat: number; lng: number } | null
  plannedIds: Set<string>
  onAdd: (customerId: string) => Promise<void>
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      const search = query.trim()
      coverageService
        .list({ scope: search || !here ? 'all' : 'nearby', lat: here?.lat, lng: here?.lng, search, limit: 30 })
        .then((r) => !cancelled && setRows(r))
        .catch(() => !cancelled && setRows([]))
        .finally(() => !cancelled && setLoading(false))
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, here])

  async function handleAdd(id: string) {
    setAdding(id)
    await onAdd(id)
    setAdding(null)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t('planPage.addTitle')}>
      <div className="space-y-3 p-4">
        <label className="flex h-12 items-center gap-2 rounded-[14px] border border-neutral-200 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-950">
          <Search className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
          <span className="sr-only">{t('planPage.searchLabel')}</span>
          <input id="add-stop-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('planPage.searchPh')} className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500" />
        </label>
        <p className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{query.trim() ? t('planPage.results') : here ? t('planPage.nearest') : t('planPage.customers')}</p>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && rows.length === 0 && (
            <p className="flex items-center justify-center gap-2 p-4 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('planPage.loading')}
            </p>
          )}
          {!loading && rows.length === 0 && <p className="p-4 text-center text-sm text-neutral-500">{t('planPage.noneFound')}</p>}
          {rows.map((r) => {
            const planned = plannedIds.has(r.customer_id)
            return (
              <div key={r.customer_id} className="flex min-h-[60px] items-center gap-2.5 border-t border-neutral-100 first:border-t-0 dark:border-neutral-800">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-neutral-900">{r.shop_name}</p>
                  <p className="truncate text-[12.5px] text-neutral-500">{r.distance_m != null ? formatDistance(r.distance_m) : ''}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.due_state === 'overdue' ? CHIP.overdue : r.due_state === 'due' ? CHIP.due : CHIP.ok}`}>{lastVisitLabel(r)}</span>
                <button
                  type="button"
                  onClick={() => handleAdd(r.customer_id)}
                  disabled={planned || adding !== null}
                  aria-label={planned ? t('planPage.plannedNamed', { name: r.shop_name }) : t('planPage.addNamed', { name: r.shop_name })}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] tap-target ${planned ? 'border-brand-500 bg-brand-500 text-white' : 'border-brand-500 text-brand-500'} disabled:opacity-100`}
                >
                  {adding === r.customer_id ? <Loader2 className="h-4 w-4 animate-spin" /> : planned ? <Check className="h-[18px] w-[18px]" /> : <Plus className="h-[18px] w-[18px]" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
