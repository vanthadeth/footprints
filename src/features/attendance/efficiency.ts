import { visitSpan, type FlagRules } from './flagRules'

/**
 * Effectiveness: the share of the person's scheduled paid time spent in
 * visits that count. One definition for every screen.
 *
 * - Paid working time is the number the server reports as hours worked
 *   (app.attendance_days): time clocked in, less the unpaid break.
 * - Scheduled: clocking in early or out late doesn't lower the ratio. Time
 *   outside the person's own hours for that day is left out of the
 *   denominator, unless a visit happened there (then the visit's time is
 *   counted on both sides, so extra effort is never punished).
 * - A visit that counts: shorter than the short-visit limit counts nothing
 *   (a drive-by); a longer one counts up to the credit cap.
 * - Gaps need no term of their own: time between visits, before the first and
 *   after the last, is in the denominator and not the numerator. The flag
 *   rules mark the long ones.
 */

/** A person's work day (app.work_day): the unpaid break and, when known, their hours ("HH:MM", Asia/Phnom_Penh). */
export interface BreakRule {
  breakMinutes: number
  breakPaid: boolean
  start?: string
  end?: string
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


type EffectivenessRules = Pick<FlagRules, 'forgottenCapMin' | 'shortVisitMin' | 'visitCreditCapMin'>

interface VisitLike {
  checked_in_at: string
  checked_out_at: string | null
  flags?: string[] | null
}

/**
 * How much of a visit counts toward effectiveness, in ms. A completed visit
 * shorter than the short-visit limit counts nothing; otherwise at most the
 * credit cap. A visit still open counts as it runs (up to the cap), so a
 * visit in progress doesn't read as zero.
 */
export function creditedVisitMs(v: VisitLike, now: number, rules: EffectivenessRules): number {
  const [start, end] = visitSpan(v, now, rules.forgottenCapMin)
  const ms = end - start
  if (v.checked_out_at && ms < rules.shortVisitMin * 60_000) return 0
  return Math.min(ms, rules.visitCreditCapMin * 60_000)
}

const localMs = (day: string, hm: string) => new Date(`${day}T${hm.slice(0, 5)}:00+07:00`).getTime()

/** First clock-in and last clock-out (or `now`, capped like paidWorkMs) over a day's sessions; null with none. */
export function sessionBounds(sessions: SessionLike[], now: number): { first: number; last: number } | null {
  if (sessions.length === 0) return null
  let first = Infinity
  let last = -Infinity
  for (const s of sessions) {
    const a = new Date(s.clock_in_at).getTime()
    first = Math.min(first, a)
    last = Math.max(last, s.clock_out_at ? new Date(s.clock_out_at).getTime() : Math.min(now, a + OPEN_SESSION_CAP_MS))
  }
  return { first, last }
}

/**
 * Time clocked in before the person's start or after their end on `day`. Their
 * hours widen to take in any visit (a visit outside them is work, so that time
 * stays in). `spans` are the day's visits as [start, end] in ms.
 */
export function outsideScheduleMs(firstMs: number, lastMs: number, day: string, rule: Pick<BreakRule, 'start' | 'end'> | null | undefined, spans: [number, number][]): number {
  if (!rule?.start || !rule.end) return 0
  let from = localMs(day, rule.start)
  let to = localMs(day, rule.end)
  for (const [a, b] of spans) {
    from = Math.min(from, a)
    to = Math.max(to, b)
  }
  return Math.max(0, from - firstMs) + Math.max(0, lastMs - to)
}

/** Paid time less the time clocked outside the person's hours; never below zero. */
export function scheduledPaidMs(paidMs: number, outsideMs: number): number {
  return Math.max(0, paidMs - outsideMs)
}

/** Hours a person is scheduled for on a day: end - start, less an unpaid break. 0 when their hours aren't known. */
export function scheduledHours(rule: BreakRule | null | undefined): number {
  if (!rule?.start || !rule.end) return 0
  const [sh, sm] = rule.start.split(':').map(Number)
  const [eh, em] = rule.end.split(':').map(Number)
  const minutes = eh * 60 + em - (sh * 60 + sm) - (rule.breakPaid ? 0 : rule.breakMinutes)
  return Math.max(0, minutes) / 60
}

/**
 * A full-day target scaled by the day's scheduled hours (a half-day Saturday
 * expects about half), at least 1. Without the person's hours, the full-day
 * target.
 */
export function scaledDailyTarget(rule: BreakRule | null | undefined, base: number, fullDayHours: number): number {
  const hours = scheduledHours(rule)
  if (hours <= 0 || fullDayHours <= 0) return base
  return Math.max(1, Math.round((base * Math.min(hours, fullDayHours)) / fullDayHours))
}

/** Unique customers expected on a day: the full-day target scaled by the day's scheduled hours. */
export function uniqueCustomerTarget(rule: BreakRule | null | undefined, rules: Pick<FlagRules, 'uniqueTarget' | 'fullDayHours'>): number {
  return scaledDailyTarget(rule, rules.uniqueTarget, rules.fullDayHours)
}

/**
 * One person-day for the efficiency ratio: visit time that counts, and paid
 * time inside their hours. `paidMs` is the server's figure for a finished day;
 * without it, paid time is worked out from the sessions.
 */
export function dayEffectiveness(
  sessions: SessionLike[],
  visits: VisitLike[],
  day: string,
  rule: BreakRule | null | undefined,
  now: number,
  rules: EffectivenessRules,
  paidMs?: number
): { creditedMs: number; scheduledPaidMs: number } {
  const creditedMs = visits.reduce((n, v) => n + creditedVisitMs(v, now, rules), 0)
  const bounds = sessionBounds(sessions, now)
  const paid = paidMs ?? paidWorkMs(sessions, now, rule)
  const outside = bounds ? outsideScheduleMs(bounds.first, bounds.last, day, rule, visits.map((v) => visitSpan(v, now, rules.forgottenCapMin))) : 0
  return { creditedMs, scheduledPaidMs: scheduledPaidMs(paid, outside) }
}

/** A finished day as the server counts it (app.attendance_days): paid minutes and the person's hours that day. */
export interface ServerDay {
  paidMinutes: number
  start?: string | null
  end?: string | null
}
