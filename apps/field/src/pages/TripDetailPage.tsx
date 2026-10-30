import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronDown } from 'lucide-react'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { DEFAULT_RATES, costOf, planTrip, ppToday, type TripRates } from '@/features/trips/trip'
import { tripErrorMessage, tripRates, tripService, toDays, type TripRow } from '@/features/trips/tripService'
import { TripReview } from '@/features/trips/TripReview'
import { TripTransferCard } from '@/features/trips/TripTransferCard'
import { CostCard, DayPills, HeroStats, PeoplePills, RouteLine } from '@/features/trips/TripParts'
import { useProvinceCounts } from '@/features/trips/useProvinceCounts'
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
  const [all, setAll] = useState<TripRow[]>([])
  const counts = useProvinceCounts()
  const [rates, setRates] = useState<TripRates>(DEFAULT_RATES)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    const [mine, team, r] = await Promise.all([tripService.mine(), tripService.team().catch(() => [] as TripRow[]), tripService.rates().catch(() => DEFAULT_RATES)])
    setRates(r)
    setAll([...mine, ...team])
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
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl lg:max-w-4xl md:px-8">
        <TripReview trip={trip} rates={rates} history={all} onDecided={() => navigate('/trips')} />
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
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl lg:max-w-4xl md:px-8">
      <div className="space-y-3 rounded-[20px] bg-brand-900 p-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-white/60">Sales trip</p>
            <p className="mt-1 text-[24px] font-extrabold leading-tight">{plan.range}</p>
            <p className="text-[13px] text-white/80">Sent by {mine ? 'you' : trip.requester} on {new Date(trip.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
          </div>
          <HeroChip status={trip.status} />
        </div>
        <HeroStats days={plan.days.length} provinces={plan.provinces.length} total={cost.total} />
        <RouteLine plan={plan} />
        <div className="border-t border-white/15 pt-3">
          <PeoplePills names={trip.people.map((p) => p.name)} dark />
        </div>
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
      {trip.status === 'pending' && mine && <StatusRow trip={trip} range={plan.range} />}
      {trip.status !== 'changes' && trip.decided_by && (
        <p className="px-1 text-[13px] text-neutral-600">
          {trip.status === 'approved' ? 'Approved' : trip.status === 'rejected' ? 'Rejected' : 'Decided'} by {trip.decided_by}
          {trip.decision_note ? ` — “${trip.decision_note}”` : ''}
        </p>
      )}

      <TripTransferCard trip={trip} onDone={() => load()} />

      <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Day by day · {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}</p>
      <DayPills plan={plan} people={n} perRoom={rates.perRoom} counts={counts} />
      <CostCard cost={cost} people={n} special={special} cap={rates.specialCap} title="Cost · rates when sent" />
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

const CHIP: Record<TripRow['status'], { label: string; tone: string }> = {
  pending: { label: 'Waiting for approval', tone: 'bg-[#FF9F2D] text-[#3b2100]' },
  approved: { label: 'Approved', tone: 'bg-status-working text-white' },
  changes: { label: 'Changes asked', tone: 'bg-[#FF9F2D] text-[#3b2100]' },
  rejected: { label: 'Rejected', tone: 'bg-status-danger text-white' },
  cancelled: { label: 'Cancelled', tone: 'bg-white/20 text-white' },
}

/** Status chip that reads on the dark hero card. */
function HeroChip({ status }: { status: TripRow['status'] }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${CHIP[status].tone}`}>{CHIP[status].label}</span>
}

/** A trip waiting for its approver: one row with the step, opening the four steps on tap. */
function StatusRow({ trip, range }: { trip: TripRow; range: string }) {
  const [open, setOpen] = useState(false)
  const sent = new Date(trip.created_at)
  const sentText = `${sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  const steps: { label: string; sub: string; done: boolean }[] = [
    { label: 'Sent', sub: sentText, done: true },
    { label: 'Your Sales Manager decides', sub: 'Any Sales Manager or Super Admin · usually within a day', done: false },
    { label: 'The trip', sub: `${range} · clock in anywhere on trip days`, done: false },
    { label: 'Back and done', sub: 'The accountant transfers the allowance', done: false },
  ]
  return (
    <section aria-label="Where this request is" className={card}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
        <span aria-hidden className="flex w-11 shrink-0 gap-[3px]">
          <i className="h-1.5 flex-1 rounded-full bg-status-working" />
          <i className="h-1.5 flex-1 rounded-full bg-status-warn" />
          <i className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          <i className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-extrabold text-neutral-900">Waiting for your Sales Manager</span>
          <span className="block text-[12.5px] text-neutral-500">Step 2 of 4 · sent {sentText}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ol className="border-t border-neutral-100 px-4 pb-4 pt-3.5 dark:border-neutral-800">
          {steps.map((st, i) => (
            <li key={st.label} className="relative flex gap-3 pb-3.5 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden className="absolute left-3 top-6 h-[calc(100%-12px)] w-0.5 bg-neutral-200 dark:bg-neutral-700" />}
              <span className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${st.done ? 'bg-status-working text-white' : i === 1 ? 'bg-status-warn text-white' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'}`}>
                {st.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-extrabold text-neutral-900">{st.label}</span>
                <span className="block text-[12.5px] text-neutral-500">{st.sub}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
