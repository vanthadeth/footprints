import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'
import { DEFAULT_RATES, costOf, planTrip, ppToday, type TripRates } from '@/features/trips/trip'
import { tripErrorMessage, tripRates, tripService, toDays, type TripRow } from '@/features/trips/tripService'
import { TripApprovalCard } from '@/features/trips/TripApprovalCard'
import { AvatarStack, CostCard, DayList, RoomsCard, RouteStrip, StatusPill } from '@/features/trips/TripParts'
import { card } from '@/features/trips/tripStyles'

/**
 * One sales trip: status, who's going, the route, day by day, rooms and the
 * estimate at the rates it was sent with. The requester can edit it after
 * changes are asked, or cancel it before it starts; an approver decides it.
 */
export function TripDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [trip, setTrip] = useState<TripRow | null>(null)
  const [rates, setRates] = useState<TripRates>(DEFAULT_RATES)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    const [mine, team, r] = await Promise.all([tripService.mine(), tripService.team().catch(() => [] as TripRow[]), tripService.rates().catch(() => DEFAULT_RATES)])
    setRates(r)
    setTrip([...mine, ...team].find((t) => t.id === id) ?? null)
    setLoaded(true)
  }, [id])

  useEffect(() => {
    load().catch((e) => {
      setError(tripErrorMessage(e))
      setLoaded(true)
    })
  }, [load])

  if (!loaded) return <div className="mx-auto mt-4 h-64 max-w-lg animate-pulse rounded-2xl bg-neutral-100" />
  if (!trip) return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-neutral-500">{error ?? 'This trip isn’t available.'}</p>

  if (trip.can_decide) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
        <TripApprovalCard trip={trip} rates={rates} onDecided={() => load()} />
      </div>
    )
  }

  const plan = planTrip(trip.start_date, toDays(trip))
  const n = trip.people_count
  const special = trip.specials.map((s) => ({ reason: s.reason, note: s.note ?? '', amount: s.amount }))
  const cost = costOf(plan, tripRates(trip, rates), n, special, trip.fuel_amount)
  const mine = trip.user_id === profile?.id
  const canCancel = mine && ['pending', 'changes', 'approved'].includes(trip.status) && trip.start_date > ppToday()

  const cancel = async () => {
    if (!window.confirm('Cancel this trip? Everyone on it loses it from their calendar.')) return
    setCancelling(true)
    try {
      await tripService.cancel(trip.id)
      await load()
    } catch (e) {
      setError(tripErrorMessage(e))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      <div className="space-y-3 rounded-[20px] bg-brand-900 p-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-white/60">Sales trip · {plan.range}</p>
            <p className="mt-1 text-[24px] font-extrabold">{plan.length}</p>
          </div>
          <StatusPill status={trip.status} />
        </div>
        <RouteStrip plan={plan} dark />
      </div>

      {trip.status === 'changes' && trip.decision_note && (
        <div className="space-y-2 rounded-2xl bg-status-warn/10 p-3.5">
          <p className="text-[13px] leading-snug text-neutral-900">
            <b>{trip.decided_by ?? 'Your manager'} asked for changes:</b> “{trip.decision_note}”
          </p>
          {mine && (
            <Link to={`/trips/${trip.id}/edit`} className="flex h-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-extrabold text-white">
              Edit and send again
            </Link>
          )}
        </div>
      )}
      {trip.status !== 'changes' && trip.decided_by && (
        <p className="px-1 text-[13px] text-neutral-600">
          {trip.status === 'approved' ? 'Approved' : trip.status === 'rejected' ? 'Rejected' : 'Decided'} by {trip.decided_by}
          {trip.decision_note ? ` — “${trip.decision_note}”` : ''}
        </p>
      )}

      <div className={`${card} flex items-center gap-3 p-3.5`}>
        <AvatarStack names={trip.people.map((p) => p.full_name)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-extrabold text-neutral-900">
            {n} {n === 1 ? 'person' : 'people'} · sent by {mine ? 'you' : trip.requester}
          </span>
          <span className="block truncate text-[12.5px] text-neutral-500">{trip.people.map((p) => p.name).join(', ')}</span>
        </span>
      </div>

      <DayList plan={plan} people={n} perRoom={rates.perRoom} />
      <RoomsCard plan={plan} people={n} perRoom={rates.perRoom} roomNights={trip.room_nights} />
      <CostCard cost={cost} people={n} special={special} cap={rates.specialCap} title="Estimated cost · rates when sent" />
      {trip.note && (
        <div className={`${card} p-3.5`}>
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Purpose</p>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-900">{trip.note}</p>
        </div>
      )}
      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      {canCancel && (
        <button type="button" disabled={cancelling} onClick={cancel} className="h-12 w-full rounded-2xl border-[1.5px] border-neutral-200 bg-white text-sm font-extrabold text-status-danger disabled:opacity-50 dark:border-neutral-700">
          {cancelling ? 'Cancelling…' : 'Cancel trip'}
        </button>
      )}
      <button type="button" onClick={() => navigate('/trips')} className="h-11 w-full text-sm font-bold text-brand-600">
        All trips
      </button>
    </div>
  )
}
