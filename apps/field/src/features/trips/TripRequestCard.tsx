import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { money, planTrip, provinceName } from './trip'
import { toDays, type TripRow } from './tripService'
import { Avatar, ProvincePill } from './TripParts'
import type { ProvinceCounts } from './ProvinceSheet'
import { card as cardCls } from './tripStyles'

/** A request waiting for the approver. The decision is made on the trip page, after the full details. */
export function TripRequestCard({ trip, counts }: { trip: TripRow; counts: ProvinceCounts }) {
  const plan = planTrip(trip.start_date, toDays(trip))
  const n = trip.people_count
  const sent = new Date(trip.created_at)
  const sentText = sent.toDateString() === new Date().toDateString() ? `sent today, ${sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : `sent ${sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  return (
    <div className={`${cardCls} space-y-3 p-3.5`}>
      <div className="flex items-center gap-3">
        <Avatar name={trip.requester} i={0} size="h-10 w-10 text-[12px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold text-neutral-900">{trip.requester}</span>
          <span className="block truncate text-[12.5px] text-neutral-500">
            {trip.requester_role ?? 'Sales'} · {sentText}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-status-warn/10 px-2 py-0.5 text-[11px] font-extrabold text-status-warn">Waiting for you</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span>
          <span className="block text-[17px] font-extrabold leading-[22px] text-neutral-900">{plan.range}</span>
          <span className="block text-[12.5px] text-neutral-500">
            {trip.days.length} {trip.days.length === 1 ? 'day' : 'days'} · {n} {n === 1 ? 'person' : 'people'}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[20px] font-extrabold leading-6 tabular-nums text-neutral-900">{money(trip.est_total)}</span>
          <span className="block text-[12px] text-neutral-500">total spending</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {plan.provinces.map((c) => (
          <ProvincePill key={c} kind="visit" name={provinceName(c)} count={counts[c]?.total} />
        ))}
      </div>
      <Link to={`/trips/${trip.id}`} className="flex h-[46px] items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-neutral-200 text-sm font-bold text-brand-600 dark:border-neutral-700">
        Review trip details <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
