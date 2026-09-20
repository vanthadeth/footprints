import { APP_TIMEZONE } from '@/lib/config'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

export type ActivityKind = 'clock-in' | 'clock-out' | 'check-in' | 'check-out'

export interface ActivityLogEntry {
  id: string
  time: string
  userId: string
  kind: ActivityKind
  customerId?: string | null
  durationMs?: number
  visitStatusId?: string | null
  orderStatusId?: string | null
  paymentStatusId?: string | null
}

/** One entry per clock-in/out and per visit check-in/out, newest-first -- the flat feed an activity log renders. */
export function buildActivityLog(attendance: AttendanceRow[], visits: VisitRow[]): ActivityLogEntry[] {
  const entries: ActivityLogEntry[] = []

  for (const a of attendance) {
    entries.push({ id: `in-${a.id}`, time: a.clock_in_at, userId: a.user_id, kind: 'clock-in' })
    if (a.clock_out_at) entries.push({ id: `out-${a.id}`, time: a.clock_out_at, userId: a.user_id, kind: 'clock-out' })
  }

  for (const v of visits) {
    entries.push({ id: `ci-${v.id}`, time: v.checked_in_at, userId: v.user_id, kind: 'check-in', customerId: v.customer_id })
    if (v.checked_out_at) {
      entries.push({
        id: `co-${v.id}`,
        time: v.checked_out_at,
        userId: v.user_id,
        kind: 'check-out',
        customerId: v.customer_id,
        durationMs: new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime(),
        visitStatusId: v.visit_status_id,
        orderStatusId: v.order_status_id,
        paymentStatusId: v.payment_status_id,
      })
    }
  }

  return entries.sort((a, b) => b.time.localeCompare(a.time))
}

export type Period = 'morning' | 'afternoon'

export interface DayGroup {
  /** "YYYY-MM-DD" in `timezone`. */
  dateKey: string
  periods: { period: Period; entries: ActivityLogEntry[] }[]
}

/** "YYYY-MM-DD" calendar date for `iso` in `timezone` -- same Intl.DateTimeFormat technique as formatDate/startOfTodayIso. */
function dayKeyOf(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(iso)
  )
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

/** 'morning' (before noon) or 'afternoon' (noon onward) for `iso` in `timezone` -- same technique as isPastTimeOfDay. */
function periodOf(iso: string, timezone: string): Period {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date(iso))) % 24
  return hour < 12 ? 'morning' : 'afternoon'
}

/** Groups a chronological activity feed into Day -> Morning/Afternoon buckets, newest day first. */
export function groupActivityLogByDay(entries: ActivityLogEntry[], timezone: string = APP_TIMEZONE): DayGroup[] {
  const byDay = new Map<string, { morning: ActivityLogEntry[]; afternoon: ActivityLogEntry[] }>()

  for (const entry of entries) {
    const dateKey = dayKeyOf(entry.time, timezone)
    const period = periodOf(entry.time, timezone)
    const group = byDay.get(dateKey) ?? { morning: [], afternoon: [] }
    group[period].push(entry)
    byDay.set(dateKey, group)
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, { morning, afternoon }]) => ({
      dateKey,
      periods: (
        [
          { period: 'morning' as const, entries: morning },
          { period: 'afternoon' as const, entries: afternoon },
        ] satisfies { period: Period; entries: ActivityLogEntry[] }[]
      ).filter((p) => p.entries.length > 0),
    }))
}
