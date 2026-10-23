import type { AttendanceDay } from '@/features/attendanceSummary/attendanceSummary'
import type { BreakRule, ServerDay } from './efficiency'

/** The server's per-day figures (paid time, hours, late, leave) keyed by date, summed over a day's rows. */
export function serverDaysOf(rows: Pick<AttendanceDay, 'day' | 'status' | 'leaveFraction' | 'workedMinutes' | 'scheduledStart' | 'scheduledEnd'>[]): Record<string, ServerDay> {
  const m: Record<string, ServerDay> = {}
  for (const r of rows) m[r.day] = { paidMinutes: (m[r.day]?.paidMinutes ?? 0) + r.workedMinutes, start: r.scheduledStart, end: r.scheduledEnd, late: r.status === 'late', leaveFraction: r.leaveFraction }
  return m
}

/**
 * computeJourneyStats's `dayContext` for a run of finished days: each day's own hours and paid time from the
 * server. The live day (`liveDay`) and days the server doesn't know are worked out from the sessions instead.
 */
export function dayContextFrom(rows: Parameters<typeof serverDaysOf>[0], liveDay: string, breakRule: BreakRule) {
  const byDay = serverDaysOf(rows)
  return (date: string) => {
    const srv = byDay[date]
    if (!srv || date === liveDay) return undefined
    return { rule: { breakMinutes: 0, breakPaid: true, start: srv.start ?? undefined, end: srv.end ?? undefined }, paidMs: srv.paidMinutes * 60_000, late: srv.late, leaveFraction: srv.leaveFraction, breakRule }
  }
}
