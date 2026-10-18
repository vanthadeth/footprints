/**
 * Efficiency (effectiveness): the share of paid working time spent inside a
 * visit. One definition for every screen. "Paid working time" is the same
 * number the server reports as hours worked (app.attendance_days): time clocked
 * in, less the unpaid break.
 */

/** A person's unpaid-break rule for a day (app.work_day: break_minutes, break_paid). */
export interface BreakRule {
  breakMinutes: number
  breakPaid: boolean
}

interface SessionLike {
  clock_in_at: string
  clock_out_at: string | null
}

const HOUR_MS = 3_600_000
/** The server never counts an open session past this (app.attendance_days). */
const OPEN_SESSION_CAP_MS = 16 * HOUR_MS

/**
 * Paid working time over one day's sessions, mirroring app.attendance_days:
 * an unpaid break comes off a day of at least break + 1 hour, less any time
 * already off the clock between the day's sessions (a lunch clock-out counts
 * toward the break first). An open session runs to `now`, capped at 16 hours.
 * Pass one calendar day's sessions; without a rule it is just time clocked in.
 */
export function paidWorkMs(sessions: SessionLike[], now: number, rule?: BreakRule | null): number {
  if (sessions.length === 0) return 0
  let grossMs = 0
  let first = Infinity
  let last = -Infinity
  for (const s of sessions) {
    const start = new Date(s.clock_in_at).getTime()
    const end = s.clock_out_at ? new Date(s.clock_out_at).getTime() : Math.min(now, start + OPEN_SESSION_CAP_MS)
    grossMs += Math.max(0, end - start)
    first = Math.min(first, start)
    last = Math.max(last, end)
  }
  if (!rule || rule.breakPaid || rule.breakMinutes <= 0) return grossMs
  const breakMs = rule.breakMinutes * 60_000
  if (grossMs < breakMs + HOUR_MS) return grossMs
  const offClockMs = Math.max(0, last - first - grossMs)
  return grossMs - Math.max(0, breakMs - offClockMs)
}

/**
 * Paid working time over several days. Whole days that have a server figure
 * (app.attendance_days -- the person's own schedule and break, whatever day it
 * was) use it; days in `liveDates` (today, or a partly counted comparison day)
 * and days without a figure are worked out here with `rule`.
 */
export function paidMsOverDays(
  days: { date: string; attendance: SessionLike[] }[],
  serverPaidMinutesByDay: Record<string, number> | undefined,
  liveDates: ReadonlySet<string>,
  now: number,
  rule?: BreakRule | null
): number {
  let total = 0
  for (const d of days) {
    const server = serverPaidMinutesByDay?.[d.date]
    total += server !== undefined && !liveDates.has(d.date) ? server * 60_000 : paidWorkMs(d.attendance, now, rule)
  }
  return total
}

/** Visit time over paid working time, 0-1 (never above 100%, even when visits overlap or run past clock-out). */
export function effectiveness(visitingMs: number, paidMs: number): number {
  return paidMs > 0 ? Math.min(1, Math.max(0, visitingMs / paidMs)) : 0
}

/** Whole percent for display, or null when there is no paid time to measure against. */
export function effectivenessPercent(visitingMs: number, paidMs: number): number | null {
  return paidMs > 0 ? Math.round(effectiveness(visitingMs, paidMs) * 100) : null
}

/** Visiting ÷ paid time at or above this reads as healthy (green); below it, as needing attention. */
export const GOOD_EFFECTIVENESS = 0.3
