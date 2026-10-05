import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { localDay } from '@/features/customers/book'
import { calendarService, type CalendarItem } from './calendarService'
import { addDays, hhmm, itemTitle, overdue, sortDay } from './calendar'

/** Check In's calendar shortcut: what's left to do today, and anything overdue. */
export function CalendarCard() {
  const { profile } = useProfile()
  const me = profile?.id ?? null
  const [items, setItems] = useState<CalendarItem[] | null>(null)
  const today = localDay(new Date().toISOString())

  useEffect(() => {
    if (!me) return
    let cancelled = false
    calendarService
      .items(me, addDays(today, -30), today)
      .then((r) => !cancelled && setItems(r))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [me, today])

  if (!items) return <div className="h-[68px] animate-pulse rounded-2xl bg-neutral-100" />

  const open = sortDay(items.filter((i) => i.day === today && !i.done && i.kind !== 'holiday' && i.kind !== 'leave'))
  const late = overdue(items, today).length
  const next = open[0]

  return (
    <Link to="/calendar" className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-visiting/10 text-status-visiting">
        <Calendar className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-neutral-900">
          Today<span className="font-semibold text-neutral-500"> · {open.length === 0 ? 'nothing to do' : `${open.length} to do`}</span>
        </span>
        <span className="block truncate text-[13px] text-neutral-500">
          {late > 0 && <span className="font-bold text-status-danger">{late} overdue · </span>}
          {next ? `${next.at_time ? `${hhmm(next.at_time)} · ` : ''}${itemTitle(next)}` : 'Tasks, appointments and follow-ups'}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-brand-600">
        Calendar <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  )
}
