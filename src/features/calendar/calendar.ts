import { shortDay } from '@/features/customers/book'
import { fromVisit, type CalendarItem, type CalendarKind } from './calendarService'

/** Colour and label per kind -- the same scheme as the canvas design. */
export const KIND: Record<CalendarKind, { label: string; dot: string; chip: string; text: string }> = {
  task: { label: 'Task', dot: 'bg-brand-500', chip: 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300', text: 'text-brand-600 dark:text-brand-300' },
  appt: { label: 'Appointment', dot: 'bg-status-visiting', chip: 'bg-status-visiting/10 text-status-visiting dark:bg-violet-400/15 dark:text-violet-300', text: 'text-status-visiting dark:text-violet-300' },
  collect: { label: 'Collection', dot: 'bg-status-danger', chip: 'bg-status-danger/10 text-status-danger dark:bg-red-400/15 dark:text-red-300', text: 'text-status-danger dark:text-red-300' },
  follow: { label: 'Call follow-up', dot: 'bg-status-warn', chip: 'bg-status-warn/10 text-status-warn dark:bg-amber-400/15 dark:text-amber-300', text: 'text-status-warn dark:text-amber-300' },
  plan: { label: 'Plan stop', dot: 'bg-status-working', chip: 'bg-status-working/10 text-status-working dark:bg-emerald-400/15 dark:text-emerald-300', text: 'text-status-working dark:text-emerald-300' },
  leave: { label: 'Leave', dot: 'bg-earth-500', chip: 'bg-earth-50 text-earth-500 dark:bg-amber-900/30 dark:text-amber-200', text: 'text-earth-500 dark:text-amber-200' },
  holiday: { label: 'Holiday', dot: 'bg-earth-400', chip: 'bg-earth-50 text-earth-500 dark:bg-amber-900/30 dark:text-amber-200', text: 'text-earth-500 dark:text-amber-200' },
}

export type CalendarFilter = 'all' | 'task' | 'appt' | 'collect' | 'follow' | 'plan' | 'off'

export const FILTERS: { key: CalendarFilter; label: string; dot?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'task', label: 'Tasks', dot: KIND.task.dot },
  { key: 'appt', label: 'Appointments', dot: KIND.appt.dot },
  { key: 'collect', label: 'Collections', dot: KIND.collect.dot },
  { key: 'follow', label: 'Call follow-ups', dot: KIND.follow.dot },
  { key: 'plan', label: 'Plan', dot: KIND.plan.dot },
  { key: 'off', label: 'Leave & holidays', dot: KIND.leave.dot },
]

export function passes(item: Pick<CalendarItem, 'kind'>, f: CalendarFilter): boolean {
  return f === 'all' || item.kind === f || (f === 'off' && (item.kind === 'leave' || item.kind === 'holiday'))
}

/** Tasks, collections and follow-ups have a done box; the rest finish by themselves (or aren't to-dos). */
export function checkable(kind: CalendarKind): boolean {
  return kind === 'task' || kind === 'collect' || kind === 'follow'
}

/** Added for the person, never typed in. */
export function isAuto(kind: CalendarKind): boolean {
  return kind === 'appt' || kind === 'collect' || kind === 'follow'
}

export function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : 'All day'
}

/** Timed items first (by time), then all-day ones (plan stops keep their order). */
export function sortDay(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort(
    (a, b) => Number(!a.at_time) - Number(!b.at_time) || (a.at_time ?? '').localeCompare(b.at_time ?? '') || a.sort_order - b.sort_order || a.title.localeCompare(b.title)
  )
}

export function byDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const m = new Map<string, CalendarItem[]>()
  for (const i of items) {
    const list = m.get(i.day)
    if (list) list.push(i)
    else m.set(i.day, [i])
  }
  for (const [k, v] of m) m.set(k, sortDay(v))
  return m
}

/** Unfinished to-dos from before today. */
export function overdue(items: CalendarItem[], today: string): CalendarItem[] {
  return items.filter((i) => i.day < today && !i.done && checkable(i.kind))
}

export function itemTitle(i: CalendarItem): string {
  if (i.kind === 'collect') return i.amount ? `Collect $${Math.round(i.amount).toLocaleString('en-US')}` : 'Collect payment'
  if (i.kind === 'appt') return `Visit ${i.title}`
  return i.title
}

/** The second line: customer and where the item came from. */
export function itemSub(i: CalendarItem): string {
  const on = i.source_date ? ` on ${shortDay(i.source_date)}` : ''
  const cust = i.customer_name && i.kind !== 'plan' && i.kind !== 'appt' ? i.customer_name : null
  let from: string | null = null
  switch (i.kind) {
    case 'task':
      from = i.assigned_by ? `Assigned by ${i.assigned_by}` : null
      break
    case 'appt':
      from = `Set after the visit${on}`
      break
    case 'collect':
      from = fromVisit(i)
        ? `Visit appointment · ${(i.source_label ?? '').toLowerCase()}${on}`
        : `Call follow-up · ${i.source_label && i.source_label !== 'call' && i.source_label !== 'note' ? i.source_label.toLowerCase() : 'collection'}${on}`
      break
    case 'follow':
      from = `From your ${i.source_label === 'note' ? 'note' : 'call'}${on}`
      break
    case 'plan':
      from = i.done ? 'Today’s plan · checked in' : 'Today’s plan'
      break
    default:
      from = null
  }
  return [cust, from].filter(Boolean).join(' · ')
}

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export interface MonthGrid {
  label: string
  /** Monday-first weeks; `inMonth` false for the padding days of the months either side. */
  days: { date: string; day: number; inMonth: boolean }[]
  from: string
  to: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** month is 0-based. Always whole weeks, so the grid is 5 or 6 rows. */
export function monthGrid(year: number, month: number): MonthGrid {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const inMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const total = Math.ceil((lead + inMonth) / 7) * 7
  const days = Array.from({ length: total }, (_, i) => {
    const dt = new Date(Date.UTC(year, month, 1 - lead + i))
    return { date: isoDate(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()), day: dt.getUTCDate(), inMonth: dt.getUTCMonth() === ((month % 12) + 12) % 12 }
  })
  return { label: `${MONTHS[((month % 12) + 12) % 12]} ${first.getUTCFullYear()}`, days, from: days[0].date, to: days[days.length - 1].date }
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return isoDate(y, m - 1, d + n)
}
