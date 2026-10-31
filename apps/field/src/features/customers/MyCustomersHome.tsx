import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, FileText, MapPin, Navigation, PlusCircle, Search, SlidersHorizontal, Store, WifiOff, X } from 'lucide-react'
import { useCan } from '@footprints/shared/features/permissions/PermissionsContext'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { formatDistance } from '@footprints/shared/lib/geo'
import { BottomSheet } from '@/components/BottomSheet'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { locationService } from '@/features/location/locationService'
import { usePlan } from '@/features/plan/usePlan'
import { todayDateString } from '@/lib/dateRange'
import type { BookRow } from './customerBookService'
import { useBookPage } from './useCustomerBook'
import { daysText } from './book'
import { applyPick, coverage, isOverdue, matchesQuery, visitNext, type QuickPick } from './customerPicks'

const tone = (d: number | null) => (d == null || d > 45 ? 'bad' : d > 30 ? 'warn' : 'ok')
const EDGE = { ok: 'bg-status-working', warn: 'bg-status-warn', bad: 'bg-status-danger' }
const CHIP = { ok: 'bg-status-working/10 text-status-working', warn: 'bg-status-warn/10 text-status-warn', bad: 'bg-status-danger/10 text-status-danger' }
const BAR: Record<string, string> = { b7: 'bg-[#17CB49]', b15: 'bg-[#6fd88a]', b30: 'bg-[#b6e3a8]', b45: 'bg-[#e8a317]', b45p: 'bg-[#F74141]' }

const mapsUrl = (r: BookRow) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.shop_name, r.district, r.province_name].filter(Boolean).join(' '))}`

/**
 * Customers landing, as on the canvas (Customers › list): search and quick
 * chips, a "Visit next" card for the nearest overdue customer, and the
 * person's customers with a recency stripe and a one-tap check in. The
 * coverage numbers moved into a sheet behind the summary line.
 */
export function MyCustomersHome({ me, onView }: { me: string | null; onView: (v: 'all' | 'mine') => void }) {
  const { t } = useLanguage()
  const canBriefing = useCan('customer_briefing')
  const today = todayDateString()
  const plan = usePlan(today)
  const planned = useMemo(() => new Set(plan.items.filter((i) => i.status === 'planned').map((i) => i.customer_id)), [plan.items])
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState<QuickPick | null>(null)
  const [sortNear, setSortNear] = useState(true)
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null)
  const [positionError, setPositionError] = useState(false)
  const [preset, setPreset] = useState<PresetCustomer | null>(null)
  const [coverOpen, setCoverOpen] = useState(false)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [toast, setToast] = useState<string | null>(null)
  const mine = useBookPage({ owner: me, sort: 'last', limit: 1000 }, !!me)
  const near = useBookPage({ owner: me, sort: 'distance', lat: position?.latitude, lng: position?.longitude, limit: 1000 }, !!me && !!position)

  useEffect(() => {
    locationService
      .getCurrentPosition()
      .then((r) => setPosition({ latitude: r.latitude, longitude: r.longitude }))
      .catch(() => setPositionError(true))
  }, [])
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const rows = mine.data
  const overdue = rows.filter(isOverdue).length
  const cover = useMemo(() => coverage(rows), [rows])
  const next = useMemo(() => visitNext(rows, position ? near.data : null), [rows, near.data, position])
  const ordered = position && sortNear ? near.data : rows
  const list = useMemo(() => applyPick(ordered, pick === 'near' ? null : pick, today, planned).filter((r) => matchesQuery(r, query)), [ordered, pick, today, planned, query])
  const filtering = !!pick || !!query.trim()

  const chips: { key: QuickPick; label: string; count: number | null }[] = [
    { key: 'near', label: t('custList.chipNear'), count: null },
    { key: 'overdue', label: t('custList.chipOverdue'), count: overdue },
    { key: 'due', label: t('custList.chipDue'), count: applyPick(rows, 'due', today, planned).length },
    { key: 'never', label: t('custList.chipNever'), count: rows.filter((r) => r.days_since == null).length },
    { key: 'plan', label: t('custList.chipPlan'), count: planned.size },
  ]

  function flash(text: string) {
    setToast(text)
    window.setTimeout(() => setToast(null), 2500)
  }
  async function addToPlan(r: BookRow) {
    try {
      await plan.add(r.customer_id)
      flash(t('custList.addedPlan'))
    } catch {
      flash(t('custList.planFailed'))
    }
  }

  const clearAll = () => {
    setQuery('')
    setPick(null)
  }

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="flex flex-col gap-3 px-4 pt-1.5 md:px-8 md:pt-4">
        {!online && (
          <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-status-warn/10 px-3.5 py-3 text-xs leading-snug text-status-warn">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <b className="block text-[13.5px]">{t('custList.offlineT')}</b>
              {t('custList.offlineB')}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <label className={`flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[14px] border bg-white px-3 shadow-card dark:bg-neutral-950 ${query ? 'border-brand-500' : 'border-transparent'}`}>
            <Search className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('customers.searchPlaceholder')} aria-label={t('customers.searchAria')} className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('menu.clearSearch')} className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          <button type="button" onClick={() => onView('all')} aria-label={t('custList.filters')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white text-neutral-800 shadow-card dark:bg-neutral-950">
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div role="group" aria-label={t('custList.quickAria')} className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {chips.map((c) => {
            const on = pick === c.key
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPick(on ? null : c.key)
                  if (c.key === 'near') setSortNear(true)
                }}
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13.5px] ${on ? 'border-brand-500 bg-brand-500 font-bold text-white' : 'border-neutral-300 bg-white font-semibold text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950'}`}
              >
                {c.key === 'near' && <MapPin className="h-3.5 w-3.5" aria-hidden />}
                {c.label}
                {c.count != null && <span className={`text-xs font-bold ${on ? 'text-white/85' : 'text-neutral-500'}`}>{c.count}</span>}
              </button>
            )
          })}
        </div>

        <button type="button" onClick={() => setCoverOpen(true)} className="flex items-center gap-1 self-start py-1 text-left text-[14px] text-neutral-900">
          {mine.loading ? '…' : overdue > 0 ? t('custList.summary', { n: rows.length.toLocaleString('en-US'), late: overdue }) : t('custList.summaryNoLate', { n: rows.length.toLocaleString('en-US') })}
          <ChevronRight className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
        </button>

        {!filtering && next && (
          <section aria-label={t('custList.next')} className="flex overflow-hidden rounded-[20px] border border-neutral-100 bg-white shadow-card">
            <span aria-hidden className="w-[5px] shrink-0 bg-status-danger" />
            <div className="min-w-0 flex-1 space-y-1.5 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('custList.next')}</span>
                <span className="rounded-full bg-status-danger/10 px-2.5 py-0.5 text-[11.5px] font-extrabold text-status-danger">{next.days_since == null ? t('custList.neverEyebrow') : t('custList.overdueDays', { n: next.days_since })}</span>
              </div>
              <Link to={`/customers/${next.customer_id}`} className="block text-[22px] font-bold leading-7 tracking-tight text-neutral-900">
                {next.shop_name}
              </Link>
              <p className="text-[13.5px] text-neutral-500">{[next.district, next.province_name].filter(Boolean).join(' · ')}</p>
              {next.distance_m != null && (
                <p className="flex items-center gap-1.5 text-[13px] text-neutral-900">
                  <MapPin className="h-4 w-4 text-brand-500" aria-hidden /> {t('custList.away', { d: formatDistance(next.distance_m) })}
                </p>
              )}
              <button type="button" onClick={() => setPreset({ id: next.customer_id, shopName: next.shop_name })} className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold text-white tap-target">
                <MapPin className="h-5 w-5" aria-hidden /> {t('custList.checkIn')}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <a href={mapsUrl(next)} target="_blank" rel="noopener" className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-neutral-200 text-[12.5px] font-bold text-neutral-900 tap-target dark:border-neutral-700">
                  <Navigation className="h-5 w-5" aria-hidden /> {t('custList.navigate')}
                </a>
                <button type="button" onClick={() => addToPlan(next)} disabled={planned.has(next.customer_id)} className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-neutral-200 text-[12.5px] font-bold text-neutral-900 tap-target disabled:opacity-60 dark:border-neutral-700">
                  {planned.has(next.customer_id) ? <Check className="h-5 w-5 text-status-working" aria-hidden /> : <PlusCircle className="h-5 w-5" aria-hidden />} {planned.has(next.customer_id) ? t('custList.inPlan') : t('custList.addPlan')}
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onView('mine')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white">
            {t('custList.mine')}
          </button>
          {canBriefing ? (
            <Link to="/team/customers" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
              <FileText className="h-4 w-4" aria-hidden /> {t('customers.briefing')}
            </Link>
          ) : (
            <span />
          )}
          <button type="button" onClick={() => onView('all')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
            <Store className="h-4 w-4" aria-hidden /> {t('customers.all')}
          </button>
        </div>

        <section aria-label={t('customers.nearbyAria')} className="space-y-2">
          <div className="mx-0.5 flex items-center justify-between text-[12.5px] text-neutral-500">
            {position ? (
              <button type="button" onClick={() => setSortNear((v) => !v)} className="h-9 text-[14px] font-bold text-brand-500">
                {sortNear ? t('custList.sortNearest') : t('custList.sortLongest')}
              </button>
            ) : (
              <span />
            )}
            <span>{t('custList.shown', { n: list.length.toLocaleString('en-US') })}</span>
          </div>

          {mine.loading ? (
            <div className="overflow-hidden rounded-2xl bg-white shadow-card">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 border-t border-neutral-100 p-3 first:border-t-0">
                  <span className="h-12 w-1 rounded bg-neutral-100" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-4 w-3/5 animate-pulse rounded bg-neutral-100" />
                    <span className="block h-3 w-4/5 animate-pulse rounded bg-neutral-100" />
                  </span>
                  <span className="h-12 w-12 animate-pulse rounded-full bg-neutral-100" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <Store className="h-7 w-7" aria-hidden />
                </span>
                <p className="text-[17px] font-bold text-neutral-900">{t('custList.emptyT')}</p>
                <p className="text-[13.5px] leading-snug text-neutral-500">{t('custList.emptyB')}</p>
                <button type="button" onClick={() => onView('all')} className="mt-2 h-12 rounded-2xl bg-brand-500 px-6 text-[15px] font-bold text-white">
                  {t('custList.browseAll')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <Search className="h-7 w-7" aria-hidden />
                </span>
                <p className="text-[17px] font-bold text-neutral-900">{t('custList.noMatchT', { q: query.trim() || chips.find((c) => c.key === pick)?.label || '' })}</p>
                <p className="text-[13.5px] leading-snug text-neutral-500">{t('custList.noMatchB')}</p>
                <button type="button" onClick={clearAll} className="mt-2 h-12 rounded-2xl bg-brand-500 px-6 text-[15px] font-bold text-white">
                  {t('custList.clearSearch')}
                </button>
              </div>
            )
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
              {list.slice(0, 50).map((r, i) => (
                <Row key={r.customer_id} row={r} first={i === 0} planned={planned.has(r.customer_id)} onVisit={setPreset} />
              ))}
            </div>
          )}
          {!position && positionError && <p className="mx-0.5 text-xs text-neutral-500">{t('custList.noLoc')}</p>}
        </section>
      </div>

      <BottomSheet open={coverOpen} onClose={() => setCoverOpen(false)} title={t('custList.coverage')}>
        <p className="mb-3 text-[13px] text-neutral-500">{t('custList.coverageSub', { n: rows.length })}</p>
        <div className="mb-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
          {cover.buckets.map((b) => (
            <span key={b.key} className={BAR[b.key]} style={{ width: rows.length ? `${(b.count / rows.length) * 100}%` : 0 }} />
          ))}
        </div>
        {cover.buckets.map((b) => (
          <div key={b.key} className="grid min-h-11 grid-cols-[120px_1fr_36px] items-center gap-2.5 text-[13.5px]">
            <span className="text-neutral-900">{t(`custList.${b.key}`)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <span className={`block h-full ${BAR[b.key]}`} style={{ width: rows.length ? `${(b.count / rows.length) * 100}%` : 0 }} />
            </span>
            <b className="text-right text-neutral-900">{b.count}</b>
          </div>
        ))}
        <p className="mt-3 text-[13px] text-neutral-500">{t('custList.coveragePct', { n: cover.within45, pct: rows.length ? Math.round((cover.within45 / rows.length) * 100) : 0 })}</p>
      </BottomSheet>

      {toast && (
        <p role="status" className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
          {toast}
        </p>
      )}
      <VisitFlow open={!!preset} onClose={() => setPreset(null)} presetCustomer={preset} />
    </div>
  )
}

function Row({ row, first, planned, onVisit }: { row: BookRow; first: boolean; planned: boolean; onVisit: (c: PresetCustomer) => void }) {
  const { t } = useLanguage()
  const d = row.days_since
  const k = tone(d)
  return (
    <div className={`flex items-stretch ${first ? '' : 'border-t border-neutral-100 dark:border-neutral-800'}`}>
      <span aria-hidden className={`w-1 shrink-0 ${EDGE[k]}`} />
      <Link to={`/customers/${row.customer_id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 py-3 pl-3 pr-2">
        <span className="truncate text-[15.5px] font-bold text-neutral-900">{row.shop_name}</span>
        <span className="truncate text-[12.5px] text-neutral-500">{[row.district, row.province_name].filter(Boolean).join(' · ')}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[k]}`}>{d == null ? t('customers.neverVisited') : daysText(d, t)}</span>
          {planned && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600 dark:bg-brand-500/15">{t('custList.inPlanChip')}</span>}
        </span>
      </Link>
      <span className="flex shrink-0 flex-col items-end justify-center gap-0.5 py-1.5 pr-2.5">
        {row.distance_m != null && <span className="text-xs font-bold text-neutral-500">{formatDistance(row.distance_m)}</span>}
        <button type="button" onClick={() => onVisit({ id: row.customer_id, shopName: row.shop_name })} aria-label={t('custList.checkInAt', { name: row.shop_name })} className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-brand-500 text-brand-500 tap-target">
          <MapPin className="h-5 w-5" aria-hidden />
        </button>
      </span>
    </div>
  )
}
