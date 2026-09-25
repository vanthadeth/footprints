import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Marker, Polyline } from 'react-leaflet'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  CircleSlash,
  Loader2,
  MapPin,
  MoreHorizontal,
  Navigation,
  Plus,
  Route,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { coverageService, type CoverageRow } from '@/features/customers/coverageService'
import { DUE_META, daysAgo, lastVisitLabel } from '@/features/customers/coverage'
import { TierBadge } from '@/features/customers/TierBadge'
import { locationService } from '@/features/location/locationService'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { stopIcon } from '@/features/fleet/map/mapIcons'
import { AddStopSheet } from '@/features/plan/AddStopSheet'
import { directionsUrl, etaMinutes, nearestNeighbourOrder, routeDistance, type LatLng } from '@/features/plan/planRoute'
import type { PlanItem } from '@/features/plan/planService'
import { usePlan } from '@/features/plan/usePlan'
import { VisitFlow } from '@/features/visits/VisitFlow'
import { APP_TIMEZONE } from '@/lib/config'
import { todayDateString } from '@/lib/dateRange'
import { formatTime } from '@/lib/datetime'
import { distanceInMeters, formatDistance } from '@/lib/geo'

type Day = 'today' | 'tomorrow'

const COLOR_DONE = '#0f6e4f'
const COLOR_SKIPPED = '#8a8f98'
const COLOR_PLANNED = '#1d6fb8'
const COLOR_NEXT = '#1668b8'

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function coords(item: { latitude: number | null; longitude: number | null }): LatLng | null {
  return item.latitude != null && item.longitude != null ? { lat: Number(item.latitude), lng: Number(item.longitude) } : null
}

/**
 * Today's plan: the rep's ordered list of stops for the day, a route map,
 * and a "next customer" card to navigate to and check in at. Stops come
 * from next-visit appointments automatically, plus anything added by hand
 * or from the "overdue nearby" suggestions; each one ticks itself off once
 * you check in there.
 */
export function PlanPage() {
  const journey = useJourneyContext()
  const [day, setDay] = useState<Day>('today')
  const today = todayDateString()
  const date = day === 'today' ? today : addDays(today, 1)
  const plan = usePlan(date)

  const [here, setHere] = useState<LatLng | null>(null)
  const [suggestions, setSuggestions] = useState<CoverageRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [actionItem, setActionItem] = useState<PlanItem | null>(null)
  const [visitCustomer, setVisitCustomer] = useState<{ id: string; shopName: string } | null>(null)
  const [optimising, setOptimising] = useState(false)

  useEffect(() => {
    locationService
      .getCurrentPosition()
      .then((r) => setHere({ lat: r.latitude, lng: r.longitude }))
      .catch(() => {
        // No fix -- the plan still works, just without distances or a "you are here" pin.
      })
  }, [])

  const plannedIds = useMemo(() => new Set(plan.items.map((i) => i.customer_id)), [plan.items])

  // Overdue/due customers near you that aren't on the plan yet.
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

  const mapPoints = useMemo(() => {
    const pts: [number, number][] = plan.items.map(coords).filter((c): c is LatLng => !!c).map((c) => [c.lat, c.lng])
    if (here) pts.push([here.lat, here.lng])
    return pts
  }, [plan.items, here])
  const routeLine: [number, number][] = [...(here ? [here] : []), ...plannedCoords].map((c) => [c.lat, c.lng])

  const isClockedIn = journey.attendance === 'CLOCKED_IN'

  async function handleOptimise() {
    setOptimising(true)
    const withCoords = planned.filter((i) => coords(i)).map((i) => ({ ...i, id: i.item_id, ...coords(i)! }))
    const ordered = nearestNeighbourOrder(here, withCoords)
    const noCoords = planned.filter((i) => !coords(i))
    const ids = [
      ...plan.items.filter((i) => i.status === 'done'),
      ...ordered,
      ...noCoords,
      ...plan.items.filter((i) => i.status === 'skipped'),
    ].map((i) => i.item_id)
    await plan.reorder(ids)
    setOptimising(false)
  }

  function move(item: PlanItem, delta: -1 | 1) {
    const ids = plan.items.map((i) => i.item_id)
    const from = ids.indexOf(item.item_id)
    const to = from + delta
    if (to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    void plan.reorder(ids)
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-3 md:max-w-2xl md:px-8">
      <SegmentedControl<Day>
        ariaLabel="Plan day"
        value={day}
        onChange={setDay}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'tomorrow', label: 'Tomorrow' },
        ]}
      />

      {plan.error && (
        <p role="alert" className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {plan.error}
        </p>
      )}

      {plan.loading && plan.items.length === 0 ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-56 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : total === 0 ? (
        <div className="rounded-2xl bg-white shadow-card">
          <EmptyState
            icon={Route}
            title={day === 'today' ? 'Nothing planned for today' : 'Nothing planned for tomorrow'}
            body="Add the shops you mean to visit. Customers you set a next visit for show up here by themselves."
          />
          <div className="px-4 pb-4">
            <button
              onClick={() => setAddOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target"
            >
              <Plus className="h-4 w-4" /> Add a stop
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="rounded-2xl bg-white p-4 shadow-card" aria-label="Progress">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[28px] font-extrabold leading-none text-neutral-900">
                  {doneCount}
                  <span className="text-lg font-bold text-neutral-400"> / {total}</span>
                </p>
                <p className="mt-1 text-[13px] text-neutral-500">
                  stops visited{planned.length > 0 && remainingM > 0 ? ` · ${formatDistance(remainingM)} to go` : ''}
                </p>
              </div>
              {planned.length > 1 && (
                <button
                  onClick={handleOptimise}
                  disabled={optimising}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-xs font-bold text-brand-600 tap-target disabled:opacity-60"
                >
                  {optimising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Best order
                </button>
              )}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
              <div className="h-full rounded-full bg-status-working transition-all" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
            </div>
          </section>

          {mapPoints.length > 0 && (
            <MapView points={mapPoints} height={220}>
              {routeLine.length > 1 && <Polyline positions={routeLine} pathOptions={{ color: COLOR_NEXT, weight: 3, opacity: 0.7, dashArray: '6 8' }} />}
              {plan.items.map((item, i) => {
                const c = coords(item)
                if (!c) return null
                const color = item.status === 'done' ? COLOR_DONE : item.status === 'skipped' ? COLOR_SKIPPED : item === next ? COLOR_NEXT : COLOR_PLANNED
                return (
                  <Marker
                    key={item.item_id}
                    position={[c.lat, c.lng]}
                    icon={stopIcon({ label: item.status === 'done' ? '✓' : String(i + 1), color, square: false, selected: item === next })}
                  />
                )
              })}
              {here && <Marker position={[here.lat, here.lng]} icon={pinIcon('#171b25', { size: 22 })} />}
            </MapView>
          )}

          {next ? (
            <section className="rounded-2xl bg-white p-4 shadow-card" aria-label="Next customer">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Next stop</p>
              <div className="mt-2 flex items-start gap-3">
                <TierBadge tier={next.tier} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-neutral-900">{next.shop_name}</p>
                  {next.address && <p className="truncate text-[13px] text-neutral-500">{next.address}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-neutral-600">
                    {nextDistance != null && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-brand-500" aria-hidden /> {formatDistance(nextDistance)} · ~{etaMinutes(nextDistance)} min
                      </span>
                    )}
                    {next.appointment_at && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5 text-status-warn" aria-hidden /> Appointment
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{planItemLastVisit(next, date)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {nextCoords ? (
                  <a
                    href={directionsUrl(nextCoords.lat, nextCoords.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-800 tap-target"
                  >
                    <Navigation className="h-4 w-4" /> Navigate
                  </a>
                ) : (
                  <span className="flex h-12 items-center justify-center rounded-xl border border-dashed border-neutral-200 text-xs text-neutral-400">
                    No map pin
                  </span>
                )}
                <button
                  onClick={() => setVisitCustomer({ id: next.customer_id, shopName: next.shop_name })}
                  disabled={!isClockedIn || day !== 'today' || !!journey.openVisit}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-40"
                >
                  <MapPin className="h-4 w-4" /> Check in
                </button>
              </div>
              {day === 'today' && !isClockedIn && (
                <p className="mt-2 text-center text-xs text-neutral-500">
                  <Link to="/check-in" className="font-semibold text-brand-600">
                    Clock in
                  </Link>{' '}
                  to start visiting.
                </p>
              )}
              {day === 'today' && journey.openVisit && (
                <p className="mt-2 text-center text-xs text-neutral-500">Finish the visit you're on first.</p>
              )}
            </section>
          ) : (
            <section className="flex items-center gap-3 rounded-2xl bg-status-working/10 p-4">
              <Check className="h-6 w-6 shrink-0 text-status-working" aria-hidden />
              <p className="text-sm font-semibold text-neutral-800">Every planned stop is done or skipped.</p>
            </section>
          )}

          <section aria-label="Stops">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[17px] font-bold text-neutral-900">Stops</h2>
              <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 text-sm font-bold text-brand-600 tap-target">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <ol className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
              {plan.items.map((item, i) => (
                <li key={item.item_id} className="flex items-center gap-3 px-3.5 py-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                      item.status === 'done' ? 'bg-status-working' : item.status === 'skipped' ? 'bg-neutral-400' : item === next ? 'bg-brand-600' : 'bg-status-visiting'
                    }`}
                  >
                    {item.status === 'done' ? <Check className="h-3.5 w-3.5" aria-label="Done" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[15px] font-semibold ${item.status === 'skipped' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                      {item.shop_name}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {item.status === 'done' && item.checked_in_at
                        ? `Visited ${formatTime(item.checked_in_at)}${item.checked_out_at ? `–${formatTime(item.checked_out_at)}` : ' · in progress'}`
                        : item.status === 'skipped'
                          ? 'Skipped'
                          : [item.source === 'appointment' ? 'Appointment' : item.source === 'suggested' ? 'Suggested' : null, planItemLastVisit(item, date)]
                              .filter(Boolean)
                              .join(' · ')}
                    </p>
                  </div>
                  <TierBadge tier={item.tier} />
                  <button
                    onClick={() => setActionItem(item)}
                    aria-label={`Options for ${item.shop_name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 tap-target"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {suggestions.length > 0 && (
        <section aria-label="Overdue nearby">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[17px] font-bold text-neutral-900">Overdue nearby</h2>
            <Link to="/customers/coverage" className="text-sm font-bold text-brand-600">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
            {suggestions.map((s) => (
              <li key={s.customer_id} className="flex items-center gap-3 px-3.5 py-3">
                <TierBadge tier={s.tier} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-neutral-900">{s.shop_name}</p>
                  <p className={`truncate text-xs ${DUE_META[s.due_state].text}`}>
                    {lastVisitLabel(s)}
                    {s.distance_m != null && <span className="text-neutral-500"> · {formatDistance(s.distance_m)}</span>}
                  </p>
                </div>
                <button
                  onClick={() => void plan.add(s.customer_id, 'suggested')}
                  aria-label={`Add ${s.shop_name} to the plan`}
                  className="flex h-9 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-600 tap-target"
                >
                  <Plus className="h-3.5 w-3.5" /> Plan
                </button>
              </li>
            ))}
          </ul>
        </section>
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
                  <SheetAction icon={ArrowUp} label="Move up" disabled={idx <= 0} onClick={act(() => move(actionItem, -1))} />
                  <SheetAction icon={ArrowDown} label="Move down" disabled={idx >= plan.items.length - 1} onClick={act(() => move(actionItem, 1))} />
                  {actionItem.status !== 'done' && (
                    <SheetAction
                      icon={actionItem.status === 'skipped' ? Undo2 : CircleSlash}
                      label={actionItem.status === 'skipped' ? 'Put back on the plan' : 'Skip today'}
                      onClick={act(() => void plan.setSkipped(actionItem.item_id, actionItem.status !== 'skipped'))}
                    />
                  )}
                  {c && (
                    <a
                      href={directionsUrl(c.lat, c.lng)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-neutral-800 tap-target"
                    >
                      <Navigation className="h-5 w-5 text-neutral-500" /> Navigate
                    </a>
                  )}
                  <Link
                    to={`/customers/${actionItem.customer_id}`}
                    className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-neutral-800 tap-target"
                  >
                    <MapPin className="h-5 w-5 text-neutral-500" /> Customer details
                  </Link>
                  {actionItem.status !== 'done' && (
                    <SheetAction icon={Trash2} label="Remove from plan" danger onClick={act(() => void plan.remove(actionItem.item_id))} />
                  )}
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

function planItemLastVisit(item: PlanItem, date: string): string {
  const days = daysAgo(item.last_visit_at, date, APP_TIMEZONE)
  if (days == null) return 'Never visited'
  if (days <= 1) return days === 0 ? 'Visited today' : 'Last visit yesterday'
  return `Last visit ${days} days ago`
}

function SheetAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Check
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold tap-target disabled:opacity-40 ${
        danger ? 'text-status-danger' : 'text-neutral-800'
      }`}
    >
      <Icon className={`h-5 w-5 ${danger ? '' : 'text-neutral-500'}`} /> {label}
    </button>
  )
}
