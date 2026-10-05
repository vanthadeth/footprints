import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { useCan } from '@/features/permissions/PermissionsContext'
import { lengthLabel, money, planTrip, ppToday, provinceName, dayLabel } from '@/features/trips/trip'
import { tripDraftStore, tripErrorMessage, tripService, toDays, type TripRow } from '@/features/trips/tripService'
import { AvatarStack, StatusPill } from '@/features/trips/TripParts'
import { card, kicker } from '@/features/trips/tripStyles'

const title = (t: TripRow) => {
  const provs = [...new Set(t.days.flatMap((d) => d.provinces))]
  return provs.slice(0, 3).map(provinceName).join(', ') + (provs.length > 3 ? ` +${provs.length - 3}` : '')
}

/**
 * Sales trips: today's trip if you're on one, then upcoming trips (waiting,
 * changes asked, approved) and past ones. "+ New trip" picks up an unsent
 * draft kept on this device.
 */
export function TripsPage() {
  const canRequest = useCan('sales_trip', 'add')
  const [trips, setTrips] = useState<TripRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const draft = tripDraftStore.load()
  const today = ppToday()

  useEffect(() => {
    tripService
      .mine()
      .then(setTrips)
      .catch((e) => {
        setError(tripErrorMessage(e))
        setTrips([])
      })
  }, [])

  const list = trips ?? []
  const current = list.find((t) => t.status === 'approved' && t.start_date <= today && t.end_date >= today)
  const upcoming = list.filter((t) => t !== current && t.end_date >= today && ['pending', 'changes', 'approved'].includes(t.status)).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const past = list.filter((t) => t !== current && !upcoming.includes(t))
  const draftReady = draft && draft.days.some((d) => d.provinces.length)

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      {current && <OnTrip trip={current} today={today} />}

      {canRequest && (
        <Link to="/trips/new" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white">
          <Plus className="h-5 w-5" aria-hidden /> {draftReady ? 'Continue your draft trip' : 'New sales trip'}
        </Link>
      )}
      {canRequest && draftReady && (
        <p className="px-1 text-[12.5px] text-neutral-500">
          Draft: {lengthLabel(draft.days.length, Math.max(draft.days.length - 1, 0))} from {dayLabel(draft.start)} · kept on this phone until you send it.
        </p>
      )}

      {trips === null && <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />}
      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {trips && !current && upcoming.length === 0 && past.length === 0 && (
        <div className={`${card} p-5 text-center`}>
          <p className="text-[15px] font-extrabold text-neutral-900">No trips yet</p>
          <p className="mt-1 text-[13px] leading-snug text-neutral-500">Pick a start date, then where you’ll visit and sleep each day. Your Sales Manager approves it before you go.</p>
        </div>
      )}

      {upcoming.length > 0 && <p className="px-0.5 pt-1 text-[17px] font-extrabold text-neutral-900">Upcoming</p>}
      {upcoming.map((t) => (
        <TripCard key={t.id} trip={t} />
      ))}

      {past.length > 0 && <p className="px-0.5 pt-1 text-[17px] font-extrabold text-neutral-900">Past and closed</p>}
      {past.length > 0 && (
        <div className={`${card} px-3.5 py-0.5`}>
          {past.map((t, i) => (
            <Link key={t.id} to={`/trips/${t.id}`} className={`flex items-center gap-2.5 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-neutral-900">{title(t)}</span>
                <span className="block truncate text-[12px] text-neutral-500">
                  {dayLabel(t.start_date)} – {dayLabel(t.end_date)} · {t.people_count === 1 ? 'just you' : `${t.people_count} people`} · {money(t.est_total)}
                </span>
              </span>
              <StatusPill status={t.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function TripCard({ trip }: { trip: TripRow }) {
  const nights = trip.days.filter((d) => d.night).length
  const others = trip.people.slice(1).map((p) => p.name)
  return (
    <Link to={`/trips/${trip.id}`} className={`${card} block space-y-1.5 p-3.5`}>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-neutral-900">{title(trip)}</span>
        <StatusPill status={trip.status} />
      </span>
      <span className="block text-[13px] text-neutral-600">
        {dayLabel(trip.start_date)} – {dayLabel(trip.end_date)} · {lengthLabel(trip.days.length, nights)}
      </span>
      <span className="flex items-center gap-2 text-[12.5px] text-neutral-500">
        <AvatarStack names={trip.people.map((p) => p.full_name)} />
        <span className="min-w-0 flex-1 truncate">
          {others.length ? `With ${others.join(', ')}` : 'Just you'} · {trip.room_nights} room-nights · est. {money(trip.est_total)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      </span>
      {trip.status === 'changes' && trip.decision_note && (
        <span className="mt-1 block rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
          {trip.decided_by ?? 'Manager'}: “{trip.decision_note}”
        </span>
      )}
    </Link>
  )
}

/** On a trip today: which day, where, tonight, who -- and the way to today's Check In. */
function OnTrip({ trip, today }: { trip: TripRow; today: string }) {
  const plan = planTrip(trip.start_date, toDays(trip))
  const d = plan.days.find((x) => x.date === today) ?? plan.days[0]
  const others = trip.people.slice(1).map((p) => p.name)
  return (
    <div className="space-y-3 rounded-[20px] bg-brand-900 p-4 text-white">
      <span className="inline-flex rounded-full bg-[#FF9F2D]/20 px-2.5 py-1 text-[12px] font-extrabold text-[#FFB257]">
        On a trip · Day {d.n} of {plan.days.length}
      </span>
      <div>
        <p className="text-[26px] font-extrabold leading-tight">{d.provinces.map(provinceName).join(' → ')}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-white/80">
          {others.length ? `With ${others.join(' and ')} · ` : ''}
          {d.back ? 'back to Phnom Penh this evening' : `tonight ${provinceName(d.night!)}${d.rooms ? `, ${d.rooms} room${d.rooms === 1 ? '' : 's'}` : ''}`}
          {d.back ? '' : ` · back in Phnom Penh ${dayLabel(plan.end)}`}
        </p>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${plan.days.length}, minmax(0, 1fr))` }}>
        {plan.days.map((x) => (
          <span key={x.n} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${x.n < d.n ? 'bg-[#17CB49]' : x.n === d.n ? 'bg-[#FFB257]' : 'bg-white/15'}`} />
            <span className={`mt-1 block text-[11px] ${x.n === d.n ? 'font-extrabold text-white' : 'text-white/70'}`}>{x.label.slice(0, 3)}</span>
          </span>
        ))}
      </div>
      <Link to="/check-in" className="flex h-11 items-center justify-center rounded-xl bg-[#ffffff] text-sm font-extrabold text-[#006ACC]">
        Open today’s Check In
      </Link>
      <Link to={`/trips/${trip.id}`} className={`${kicker} block text-center !text-white/70`}>
        Trip details ›
      </Link>
    </div>
  )
}
