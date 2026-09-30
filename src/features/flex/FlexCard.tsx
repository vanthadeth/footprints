import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import { cycleLabel, dayDate, days, over, type FlexCycle } from './flex'

/** The Leave tab's shortcut to Days off, for people on flexible days off. */
export function FlexCard({ cycle }: { cycle: FlexCycle }) {
  const o = over(cycle)
  return (
    <Link
      to="/leave/days-off"
      aria-label={`Flexible days off: ${o ? `${days(o)} over` : `${days(cycle.left)} of ${days(cycle.allowance)} left`} this cycle`}
      className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-visiting/10 text-status-visiting dark:text-violet-300">
        <CalendarRange className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">Flexible days off</span>
        <span className="block truncate text-[12.5px] text-neutral-500">
          {cycleLabel(cycle)}
          {cycle.planned > 0 && ` · ${days(cycle.planned)} planned`} · settles {dayDate(cycle.cycleEnd)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[22px] font-extrabold leading-none ${o ? 'text-status-danger' : 'text-neutral-900'}`}>{o ? `+${days(o)}` : days(cycle.left)}</span>
        <span className="block text-[11px] font-semibold text-neutral-500">{o ? 'over' : `of ${days(cycle.allowance)} left`}</span>
      </span>
    </Link>
  )
}
