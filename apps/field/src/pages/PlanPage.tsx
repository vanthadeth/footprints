import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Marker, Polyline } from 'react-leaflet'
import { ArrowDown, ArrowUp, Check, CircleSlash, GripVertical, List, Loader2, Map as MapIcon, MapPin, MoreHorizontal, Navigation, Plus, Route, Sparkles, Trash2, Undo2, WifiOff } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { coverageService, type CoverageRow } from '@/features/customers/coverageService'
import { daysAgo } from '@/features/customers/coverage'
import { locationService } from '@/features/location/locationService'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { stopIcon } from '@/features/fleet/map/mapIcons'
import { AddStopSheet } from '@/features/plan/AddStopSheet'
import { directionsUrl, etaMinutes, nearestNeighbourOrder, routeDistance, type LatLng } from '@/features/plan/planRoute'
import type { PlanItem } from '@/features/plan/planService'
import { edgeTone, moveItem, planSegments, type EdgeTone } from '@/features/plan/planView'
import { useDragReorder } from '@/features/plan/useDragReorder'
import { usePlan } from '@/features/plan/usePlan'
import { VisitFlow } from '@/features/visits/VisitFlow'
import { APP_TIMEZONE } from '@footprints/shared/lib/config'
import { todayDateString } from '@/lib/dateRange'
import { formatTime } from '@footprints/shared/lib/datetime'
import { distanceInMeters, formatDistance } from '@footprints/shared/lib/geo'

type Day = 'today' | 'tomorrow'
type View = 'list' | 'map'

const COLOR_DONE = '#8a8f98'
const COLOR_SKIPPED = '#b6bac1'
const COLOR_PLANNED = '#1d6fb8'
const COLOR_NEXT = '#006ACC'

const EDGE: Record<EdgeTone, string> = { ok: 'bg-status-working', warn: 'bg-status-warn', bad: 'bg-status-danger', mute: 'bg-neutral-300' }
const SEG: Record<string, string> = { done: 'bg-[#17CB49]', next: 'bg-brand-500', todo: 'bg-neutral-200 dark:bg-neutral-700', skipped: 'bg-neutral-300 dark:bg-neutral-600' }
const CHIP = { ok: 'bg-status-working/10 text-status-working', bad: 'bg-status-danger/10 text-status-danger', warn: 'bg-status-warn/10 text-status-warn', mu: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800', br: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' }

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function coords(item: { latitude: number | null; longitude: number | null }): LatLng | null {
  return item.latitude != null && item.longitude != null ? { lat: Number(item.latitude), lng: Number(item.longitude) } : null
}

/**
 * Today's plan, as on the canvas (Plan): Today / Tomorrow and a List / Map
 * toggle, a progress card with the route summary, the next stop with a big
 * Check in, and the ordered stops (drag the grip, or use the options sheet).
 * Stops come from next-visit appointments automatically, plus anything
 * added by hand; each one ticks itself off once you check in there.
 */
export function PlanPage() {
  const { t } = useLanguage()
  const journey = useJourneyContext()
  const [day, setDay] = useState<Day>('today')
  const [view, setView] = useState<View>('list')
  const today = todayDateString()
  const date = day === 'today' ? today : addDays(today, 1)
  const plan = usePlan(date)

  const [here, setHere] = useState<LatLng | null>(null)
  const [suggestions, setSuggestions] = useState<CoverageRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [actionItem, setActionItem] = useState<PlanItem | null>(null)
  const [visitCustomer, setVisitCustomer] = useState<{ id: string; shopName: string } | null>(null)
  const [optimising, setOptimising] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    locationService
      .getCurrentPosition()
      .then((r) => setHere({ lat: r.latitude, lng: r.longitude }))
      .catch(() => {
        // No fix -- the plan still works, just without distances or a "you are here" pin.
      })
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

  const plannedIds = useMemo(() => new Set(plan.items.map((i) => i.customer_id)), [plan.items])

  // Overdue/due customers near you that aren't on the plan yet (for "Add overdue near you").
  useEffect(() => {
    let cancelled = false
    coverageService
      .list({ scope: here ? 'nearby' : 'mine', lat: here?.lat, lng: here?.lng, limit: 80 })
      .then((rows) => {
        if (cancelled) return
        setSuggestions(rows.filter((r) => (r.due_state === 'overdue' || r.due_state === 'due') && !plannedIds.has(r.customer_id)).slice(0, 4))
      })
      .catch(() => !cancelled && setSuggestions([]))
    return () => {
      cancelled = true
    }
  }, [here, plannedIds])

  const planned = plan.items.filter((i) => i.status === 'planned')
  const doneCount = plan.items.filter((i) => i.status === 'done').length
  const total = plan.items.length
  const next = planned[0] ?? null
  const nextCoords = next ? coords(next) : null
  const nextDistance = here && nextCoords ? distanceInMeters(here.lat, here.lng, nextCoords.lat, nextCoords.lng) : null
  const plannedCoords = planned.map(coords).filter((c): c is LatLng => !!c)
  const remainingM = routeDistance(here, plannedCoords)
  const segments = planSegments(plan.items)

  // Distance and minutes of each leg: from you to the first stop still to visit, then stop to stop.
  const legs = useMemo(() => {
    const m = new Map<string, number>()
    let prev: LatLng | null = here
    for (const item of plan.items.filter((i) => i.status === 'planned')) {
      const c = coords(item)
      if (c && prev) m.set(item.item_id, distanceInMeters(prev.lat, prev.lng, c.lat, c.lng))
      if (c) prev = c
    }
    return m
  }, [plan.items, here])

  const mapPoints = useMemo(() => {
    const pts: [number, number][] = plan.items.map(coords).filter((c): c is LatLng => !!c).map((c) => [c.lat, c.lng])
    if (here) pts.push([here.lat, here.lng])
    return pts
  }, [plan.items, here])
  const routeLine: [number, number][] = [...(here ? [here] : []), ...plannedCoords].map((c) => [c.lat, c.lng])

  const isClockedIn = journey.attendance === 'CLOCKED_IN'
  const selected = plan.items.find((i) => i.item_id === selectedId) ?? next

  async function handleOptimise() {
    setOptimising(true)
    const withCoords = planned.filter((i) => coords(i)).map((i) => ({ ...i, id: i.item_id, ...coords(i)! }))
    const ordered = nearestNeighbourOrder(here, withCoords)
    const noCoords = planned.filter((i) => !coords(i))
    const ids = [...plan.items.filter((i) => i.status === 'done'), ...ordered, ...noCoords, ...plan.items.filter((i) => i.status === 'skipped')].map((i) => i.item_id)
    await plan.reorder(ids)
    setOptimising(false)
  }

  function move(item: PlanItem, delta: -1 | 1) {
    const ids = plan.items.map((i) => i.item_id)
    const from = ids.indexOf(item.item_id)
    void plan.reorder(moveItem(ids, from, from + delta))
  }
  const { drag, bind } = useDragReorder((from, to) => void plan.reorder(moveItem(plan.items.map((i) => i.item_id), from, to)))

  const lastText = (item: PlanItem) => {
    const d = daysAgo(item.last_visit_at, date, APP_TIMEZONE)
    return d == null ? t('planPage.neverVisited') : d === 0 ? t('planPage.lastToday') : d === 1 ? t('planPage.lastYesterday') : t('planPage.daysAgo', { n: d })
  }
  const daysOf = (item: PlanItem) => daysAgo(item.last_visit_at, date, APP_TIMEZONE)
  const toneChip = (tone: EdgeTone) => (tone === 'bad' ? CHIP.bad : tone === 'warn' ? CHIP.warn : tone === 'ok' ? CHIP.ok : CHIP.mu)
  const sourceChips = (item: PlanItem) => {
    const out: { text: string; cls: string }[] = []
    if (item.appointment_at) out.push({ text: t('planPage.appointmentAt', { time: formatTime(item.appointment_at) }), cls: CHIP.br })
    else if (item.source === 'appointment') out.push({ text: t('planPage.appointment'), cls: CHIP.br })
    else if (item.source === 'suggested') out.push({ text: t('planPage.suggested'), cls: CHIP.br })
    else if (item.source === 'manual') out.push({ text: t('planPage.addedByYou'), cls: CHIP.mu })
    return out
  }
  const overdueChip = (item: PlanItem) => {
    const d = daysOf(item)
    if (d == null) return t('planPage.neverVisited')
    return d > 45 ? t('planPage.overdueDays', { n: d }) : null
  }
  const checkInDisabled = !isClockedIn || day !== 'today' || !!journey.openVisit
  const stopLabel = (item: PlanItem) => `${plan.items.indexOf(item) + 1}`
  const addOverdue = () => suggestions.forEach((s) => void plan.add(s.customer_id, 'suggested'))
  const noGps = !here

  return (
    <div className="mx-auto max-w-lg space-y-3.5 px-4 pb-8 pt-3 md:max-w-2xl md:px-8 lg:max-w-3xl">
      {!online && (
        <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-status-warn/10 px-3.5 py-3 text-xs leading-snug text-status-warn">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <b className="block text-[13.5px]">{t('planPage.offlineT')}</b>
            {t('planPage.offlineB')}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <SegmentedControl<Day>
            ariaLabel={t('planPage.tabsAria')}
            value={day}
            onChange={setDay}
            options={[
              { value: 'today', label: t('planPage.today') },
              { value: 'tomorrow', label: t('planPage.tomorrow') },
            ]}
          />
        </div>
        {total > 0 && (
          <div role="group" aria-label={t('planPage.viewAria')} className="flex shrink-0 rounded-[14px] bg-white p-[3px] shadow-card dark:bg-neutral-950">
            {(
              [
                ['list', List, t('planPage.listView')],
                ['map', MapIcon, t('planPage.mapView')],
              ] as const
            ).map(([k, Icon, label]) => (
              <button key={k} type="button" aria-pressed={view === k} aria-label={label} onClick={() => setView(k)} className={`flex h-10 w-11 items-center justify-center rounded-[11px] ${view === k ? 'bg-brand-500 text-white' : 'text-neutral-500'}`}>
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>

      {plan.error && (
        <p role="alert" className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {plan.error}
        </p>
      )}

      {plan.loading && plan.items.length === 0 ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 border-t border-neutral-100 p-3 first:border-t-0">
                <span className="h-8 w-8 animate-pulse rounded-full bg-neutral-100" />
                <span className="flex-1 space-y-2">
                  <span className="block h-4 w-3/5 animate-pulse rounded bg-neutral-100" />
                  <span className="block h-3 w-4/5 animate-pulse rounded bg-neutral-100" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
            <Route className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-[17px] font-bold text-neutral-900">{t(day === 'today' ? 'planPage.noPlanToday' : 'planPage.noPlanTomorrow')}</p>
          <p className="text-[13.5px] leading-snug text-neutral-500">{t('planPage.noPlanBody')}</p>
          <button onClick={() => setAddOpen(true)} className="mt-2 flex h-[52px] items-center gap-2 rounded-2xl bg-brand-500 px-6 text-base font-bold text-white tap-target">
            <Plus className="h-5 w-5" aria-hidden /> {t('planPage.makePlan')}
          </button>
          {suggestions.length > 0 && (
            <button onClick={addOverdue} className="flex h-[52px] items-center gap-2 rounded-2xl border-[1.5px] border-neutral-300 px-6 text-base font-bold text-neutral-900 tap-target dark:border-neutral-600">
              <Sparkles className="h-5 w-5" aria-hidden /> {t('planPage.addOverdue')}
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="space-y-2.5 rounded-[20px] bg-white p-4 shadow-card" aria-label={t('planPage.doneOf', { done: doneCount, total })}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[30px] font-extrabold leading-[34px] tracking-tight text-neutral-900">
                {planned.length === 0 ? (
                  <span className="text-[22px]">{t('planPage.allDone')}</span>
                ) : (
                  <>
                    {doneCount} <span className="text-sm font-semibold tracking-normal text-neutral-500">{t('planPage.ofTotal', { total })}</span>
                  </>
                )}
              </p>
              {planned.length > 1 && (
                <button onClick={handleOptimise} disabled={optimising || noGps} className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border-[1.5px] border-neutral-300 px-3.5 text-[13.5px] font-bold text-brand-600 tap-target disabled:opacity-45 dark:border-neutral-600">
                  {optimising ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-[18px] w-[18px]" aria-hidden />}
                  {t('planPage.optimise')}
                </button>
              )}
            </div>
            <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
              {segments.map((s, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${SEG[s]}`} />
              ))}
            </div>
            <p className="text-[13px] text-neutral-500">
              {planned.length === 0 ? t('planPage.allDoneSub', { n: doneCount }) : noGps ? t('planPage.noGpsMeta') : remainingM > 0 ? t('planPage.routeMeta', { km: formatDistance(remainingM), min: etaMinutes(remainingM) }) : ''}
            </p>
          </section>

          {view === 'map' && (
            <>
              {mapPoints.length > 0 && (
                <MapView points={mapPoints} height={430} aria-label={t('planPage.mapAria')}>
                  {routeLine.length > 1 && <Polyline positions={routeLine} pathOptions={{ color: COLOR_NEXT, weight: 3, opacity: 0.7, dashArray: '6 8' }} />}
                  {plan.items.map((item, i) => {
                    const c = coords(item)
                    if (!c) return null
                    const color = item.status === 'done' ? COLOR_DONE : item.status === 'skipped' ? COLOR_SKIPPED : item === next ? COLOR_NEXT : COLOR_PLANNED
                    return <Marker key={item.item_id} position={[c.lat, c.lng]} eventHandlers={{ click: () => setSelectedId(item.item_id) }} icon={stopIcon({ label: item.status === 'done' ? '✓' : String(i + 1), color, square: false, selected: item === selected })} />
                  })}
                  {here && <Marker position={[here.lat, here.lng]} icon={pinIcon('#232323', { size: 22 })} />}
                </MapView>
              )}
              {selected && (
                <section aria-label={t('planPage.peekAria')} className="flex overflow-hidden rounded-[20px] bg-white shadow-card">
                  <span aria-hidden className={`w-[5px] shrink-0 ${EDGE[edgeTone(selected, daysOf(selected))]}`} />
                  <div className="min-w-0 flex-1 space-y-1.5 p-3.5">
                    <p className="truncate text-base font-bold text-neutral-900">
                      {stopLabel(selected)} · {selected.shop_name}
                    </p>
                    <p className="truncate text-[13px] text-neutral-500">{[selected.address, legs.get(selected.item_id) != null ? formatDistance(legs.get(selected.item_id)!) : null].filter(Boolean).join(' · ')}</p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setVisitCustomer({ id: selected.customer_id, shopName: selected.shop_name })} disabled={checkInDisabled || selected.status === 'done'} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white tap-target disabled:opacity-40">
                        <MapPin className="h-[18px] w-[18px]" aria-hidden /> {t('planPage.checkIn')}
                      </button>
                      {coords(selected) && (
                        <a href={directionsUrl(coords(selected)!.lat, coords(selected)!.lng)} target="_blank" rel="noreferrer" aria-label={t('planPage.navigate')} className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.5px] border-neutral-300 text-neutral-900 tap-target dark:border-neutral-600">
                          <Navigation className="h-5 w-5" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {view === 'list' && next && (
            <section className="flex overflow-hidden rounded-[20px] bg-white shadow-card" aria-label={t('planPage.nextStop', { n: stopLabel(next), total })}>
              <span aria-hidden className={`w-[5px] shrink-0 ${EDGE[edgeTone(next, daysOf(next))]}`} />
              <div className="min-w-0 flex-1 space-y-1.5 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('planPage.nextStop', { n: stopLabel(next), total })}</span>
                  {overdueChip(next) && <span className="rounded-full bg-status-danger/10 px-2.5 py-0.5 text-[11.5px] font-extrabold text-status-danger">{overdueChip(next)}</span>}
                </div>
                <Link to={`/customers/${next.customer_id}`} className="block text-[22px] font-bold leading-7 tracking-tight text-neutral-900">
                  {next.shop_name}
                </Link>
                {next.address && <p className="truncate text-[13.5px] text-neutral-500">{next.address}</p>}
                {nextDistance != null && (
                  <p className="flex items-center gap-1.5 text-[13px] text-neutral-900">
                    <MapPin className="h-4 w-4 text-brand-500" aria-hidden /> {t('planPage.away', { d: formatDistance(nextDistance), m: etaMinutes(nextDistance) })}
                  </p>
                )}
                {next.appointment_at && <p className="text-[13px] font-semibold text-brand-600">{t('planPage.appointmentAt', { time: formatTime(next.appointment_at) })}</p>}
                <button onClick={() => setVisitCustomer({ id: next.customer_id, shopName: next.shop_name })} disabled={checkInDisabled} className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold text-white tap-target disabled:opacity-40">
                  <MapPin className="h-5 w-5" aria-hidden /> {t('planPage.checkIn')}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {nextCoords ? (
                    <a href={directionsUrl(nextCoords.lat, nextCoords.lng)} target="_blank" rel="noreferrer" className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-neutral-200 text-[12.5px] font-bold text-neutral-900 tap-target dark:border-neutral-700">
                      <Navigation className="h-5 w-5" aria-hidden /> {t('planPage.navigate')}
                    </a>
                  ) : (
                    <span className="flex h-[52px] items-center justify-center rounded-[14px] border border-dashed border-neutral-200 text-xs text-neutral-400">{t('planPage.noMapPin')}</span>
                  )}
                  <button onClick={() => void plan.setSkipped(next.item_id, true)} className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-neutral-200 text-[12.5px] font-bold text-neutral-900 tap-target dark:border-neutral-700">
                    <CircleSlash className="h-5 w-5" aria-hidden /> {t('planPage.skipToday')}
                  </button>
                </div>
                {day === 'today' && !isClockedIn && (
                  <p className="text-center text-xs text-neutral-500">
                    <Link to="/check-in" className="font-semibold text-brand-600">
                      {t('planPage.clockInPre')}
                    </Link>{' '}
                    {t('planPage.clockInPost')}
                  </p>
                )}
                {day === 'today' && journey.openVisit && <p className="text-center text-xs text-neutral-500">{t('planPage.finishFirst')}</p>}
              </div>
            </section>
          )}

          {view === 'list' && (
            <section aria-label={t('planPage.stops')}>
              <div className="mx-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('planPage.stops')}</h2>
                <span className="text-[12.5px] text-neutral-500">{drag ? t('planPage.dragHint') : t('planPage.stopsCount', { n: total })}</span>
              </div>
              <ol className="overflow-hidden rounded-2xl bg-white shadow-card">
                {plan.items.map((item, i) => {
                  const d = daysOf(item)
                  const tone = edgeTone(item, d)
                  const leg = legs.get(item.item_id)
                  const lifted = drag?.from === i
                  const target = drag != null && drag.over === i && drag.from !== i
                  const canDrag = item.status === 'planned'
                  return (
                    <li key={item.item_id} data-row-index={i} className={`relative flex items-center border-t border-neutral-100 first:border-t-0 dark:border-neutral-800 ${lifted ? 'z-10 scale-[1.02] rounded-xl bg-white shadow-lg' : ''} ${target ? 'bg-brand-50/60 dark:bg-brand-500/10' : ''}`}>
                      <span aria-hidden className={`self-stretch ${EDGE[tone]} w-1 shrink-0`} />
                      {canDrag ? (
                        <span {...bind(i)} role="button" aria-label={t('planPage.reorderHandle', { name: item.shop_name })} className="flex h-12 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-neutral-400">
                          <GripVertical className="h-5 w-5" aria-hidden />
                        </span>
                      ) : (
                        <span className="w-9 shrink-0" />
                      )}
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${item.status === 'done' ? 'bg-status-working/10 text-status-working' : item === next ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800'}`}>
                        {item.status === 'done' ? <Check className="h-4 w-4" aria-label="Done" /> : i + 1}
                      </span>
                      <button type="button" onClick={() => setActionItem(item)} aria-label={t('planPage.optionsFor', { name: item.shop_name })} className="flex min-h-[76px] min-w-0 flex-1 flex-col justify-center gap-px py-2.5 pl-2.5 pr-1 text-left">
                        <span className={`truncate text-[15.5px] font-bold ${item.status === 'done' || item.status === 'skipped' ? 'text-neutral-500' : 'text-neutral-900'} ${item.status === 'skipped' ? 'line-through' : ''}`}>{item.shop_name}</span>
                        <span className="truncate text-[12.5px] text-neutral-500">{item.address ?? ''}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1.5">
                          {item.status === 'done' && item.checked_in_at && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP.ok}`}>{t('planPage.doneAt', { time: formatTime(item.checked_in_at) })}</span>}
                          {item.status === 'skipped' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP.mu}`}>{t('planPage.skipped')}</span>}
                          {item.status === 'planned' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${toneChip(tone)}`}>{lastText(item)}</span>}
                          {sourceChips(item).map((c) => (
                            <span key={c.text} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.cls}`}>
                              {c.text}
                            </span>
                          ))}
                        </span>
                      </button>
                      <span className="flex shrink-0 flex-col items-end pr-2">
                        {leg != null && (
                          <>
                            <b className="text-[13px] text-neutral-900">{formatDistance(leg)}</b>
                            <span className="text-[11.5px] text-neutral-500">{etaMinutes(leg)} min</span>
                          </>
                        )}
                      </span>
                      <button type="button" onClick={() => setActionItem(item)} aria-label={t('planPage.optionsFor', { name: item.shop_name })} className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 tap-target">
                        <MoreHorizontal className="h-5 w-5" aria-hidden />
                      </button>
                    </li>
                  )
                })}
                <li>
                  <button onClick={() => setAddOpen(true)} className="flex h-14 w-full items-center justify-center gap-2 border-t border-neutral-100 text-[15px] font-bold text-brand-600 dark:border-neutral-800">
                    <Plus className="h-5 w-5" aria-hidden /> {t('planPage.addStop')}
                  </button>
                </li>
              </ol>
            </section>
          )}
        </>
      )}

      <AddStopSheet open={addOpen} onClose={() => setAddOpen(false)} here={here} plannedIds={plannedIds} onAdd={(id) => plan.add(id)} />

      <BottomSheet open={actionItem !== null} onClose={() => setActionItem(null)} title={actionItem?.shop_name ?? ''}>
        {actionItem && (
          <div className="space-y-1 p-3">
            {(() => {
              const idx = plan.items.findIndex((i) => i.item_id === actionItem.item_id)
              const c = coords(actionItem)
              const act = (fn: () => void) => () => {
                fn()
                setActionItem(null)
              }
              return (
                <>
                  <Link to={`/customers/${actionItem.customer_id}`} className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-neutral-800 tap-target">
                    <MapPin className="h-5 w-5 text-neutral-500" /> {t('planPage.openCustomer')}
                  </Link>
                  <SheetAction icon={ArrowUp} label={t('planPage.moveUp')} disabled={idx <= 0} onClick={act(() => move(actionItem, -1))} />
                  <SheetAction icon={ArrowDown} label={t('planPage.moveDown')} disabled={idx >= plan.items.length - 1} onClick={act(() => move(actionItem, 1))} />
                  {actionItem.status !== 'done' && (
                    <SheetAction
                      icon={actionItem.status === 'skipped' ? Undo2 : CircleSlash}
                      label={actionItem.status === 'skipped' ? t('planPage.putBack') : t('planPage.skipToday')}
                      onClick={act(() => void plan.setSkipped(actionItem.item_id, actionItem.status !== 'skipped'))}
                    />
                  )}
                  {c && (
                    <a href={directionsUrl(c.lat, c.lng)} target="_blank" rel="noreferrer" className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-neutral-800 tap-target">
                      <Navigation className="h-5 w-5 text-neutral-500" /> {t('planPage.navigate')}
                    </a>
                  )}
                  {actionItem.status !== 'done' && <SheetAction icon={Trash2} label={t('planPage.remove')} danger onClick={act(() => void plan.remove(actionItem.item_id))} />}
                </>
              )
            })()}
          </div>
        )}
      </BottomSheet>

      <VisitFlow open={visitCustomer !== null} onClose={() => setVisitCustomer(null)} presetCustomer={visitCustomer} />
    </div>
  )
}

function SheetAction({ icon: Icon, label, onClick, disabled, danger }: { icon: typeof Check; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold tap-target disabled:opacity-40 ${danger ? 'text-status-danger' : 'text-neutral-800'}`}>
      <Icon className={`h-5 w-5 ${danger ? '' : 'text-neutral-500'}`} /> {label}
    </button>
  )
}
