import { Link } from 'react-router-dom'
import { ChevronRight, Route } from 'lucide-react'
import { todayDateString } from '@/lib/dateRange'
import { usePlan } from './usePlan'

/** Check In's "Today's plan" shortcut: progress and the next stop, or a nudge to plan the day. */
export function PlanCard() {
  const { items, loading } = usePlan(todayDateString())
  if (loading && items.length === 0) return <div className="h-[68px] animate-pulse rounded-2xl bg-neutral-100" />

  const done = items.filter((i) => i.status === 'done').length
  const next = items.find((i) => i.status === 'planned')

  return (
    <Link to="/plan" className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Route className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">
          Today's plan{items.length > 0 && <span className="font-semibold text-neutral-500"> · {done} of {items.length} done</span>}
        </span>
        <span className="block truncate text-[13px] text-neutral-500">
          {items.length === 0 ? 'Plan which shops to visit today' : next ? `Next: ${next.shop_name}` : 'All planned stops covered'}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
    </Link>
  )
}
