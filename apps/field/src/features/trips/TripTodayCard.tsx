import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Map as MapIcon } from 'lucide-react'
import { planTrip, ppToday, provinceName } from './trip'
import { tripService, toDays, type TripRow } from './tripService'

/**
 * Check In on a sales trip day: which day, where today, tonight's overnight
 * and rooms -- and that clock-in works away from the usual work locations.
 * Renders nothing on other days.
 */
export function TripTodayCard() {
  const [trip, setTrip] = useState<TripRow | null>(null)
  const today = ppToday()
  useEffect(() => {
    let cancelled = false
    tripService
      .mine()
      .then((rows) => !cancelled && setTrip(rows.find((t) => t.status === 'approved' && t.start_date <= today && t.end_date >= today) ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [today])
  if (!trip) return null
  const plan = planTrip(trip.start_date, toDays(trip))
  const d = plan.days.find((x) => x.date === today)
  if (!d) return null
  const others = trip.people.slice(1).map((p) => p.name)
  return (
    <Link to={`/trips/${trip.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-earth-50 text-earth-500">
        <MapIcon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-extrabold uppercase tracking-wide text-earth-500">
          Sales trip · Day {d.n} of {plan.days.length}
        </span>
        <span className="block truncate text-[15px] font-extrabold text-neutral-900">{d.provinces.map(provinceName).join(' → ')}</span>
        <span className="block truncate text-[12.5px] text-neutral-500">
          {d.back ? 'Back to Phnom Penh tonight' : `Tonight ${provinceName(d.night!)}${d.rooms ? ` · ${d.rooms} room${d.rooms === 1 ? '' : 's'}` : ''}`}
          {others.length ? ` · with ${others.join(', ')}` : ''} · clock in anywhere today
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
    </Link>
  )
}
