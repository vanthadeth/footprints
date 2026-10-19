import { INEFFECTIVE_VISIT_WEIGHT, LATE_FIRST_VISIT_SCORE_FACTOR, NEAR_FIRST_VISIT_KM, SCORE_GOAL_ACTIVE, SCORE_GOAL_ORDERS, SCORE_GOAL_VISITS, TRAVEL_KM_PER_ACTIVE_HOUR } from '@/lib/config'
import { countsAsOrdered, type OrderState } from '@/features/orders/orderReconcile'
import { distanceInMeters } from '@/lib/geo'
import { creditedVisitMs, dayEffectiveness, scaledDailyTarget, type BreakRule } from './efficiency'
import type { FlagRules } from './flagRules'

/**
 * The effectiveness score, 0 to 10, for one person-day: the average of three
 * parts, each scored against its own goal and capped at 100% of it.
 *
 * - Visits: effective visits (completed and long enough to count) plus a quarter
 *   of the ineffective ones, over the day's visit target. Goal: 100% of target.
 * - Active hours: active time over working time in the person's hours, where every
 *   full 50 km travelled adds an hour to active time. Goal: 50% of working time.
 * - Orders: visits that ordered over all visits. Goal: 25% of visits.
 *
 * A first visit after the deadline that is within 10 km of where the person
 * clocked in, so distance doesn't explain it, takes 10% off the score.
 */

export type ScoreBand = 'low' | 'average' | 'good' | 'excellent'

/** Under 5 is low, 5 up to 8 average, 8 to 9 good, above 9 excellent. */
export function scoreBand(score: number): ScoreBand {
  if (score < 5) return 'low'
  if (score < 8) return 'average'
  if (score <= 9) return 'good'
  return 'excellent'
}

export const BAND_LABEL: Record<ScoreBand, string> = { low: 'Low', average: 'Average', good: 'Good', excellent: 'Excellent' }

/** Text colour for a score: red when low, amber average, green good or excellent. */
export function scoreTextClass(score: number | null | undefined): string {
  if (score == null) return 'text-neutral-900'
  const band = scoreBand(score)
  return band === 'low' ? 'text-status-danger' : band === 'average' ? 'text-status-warn' : 'text-status-working'
}

/** One decimal, like "7.8"; "—" without a score. */
export function formatScore(score: number | null | undefined): string {
  return score == null ? '—' : score.toFixed(1)
}

const round1 = (n: number) => Math.round(n * 10) / 10
const HOUR_MS = 3_600_000

export interface ScoreInputs {
  effectiveVisits: number
  ineffectiveVisits: number
  visitTarget: number
  /** Visits that count as ordered (confirmed, found in the sync, or marked and still pending), and all visits. */
  orderedVisits: number
  totalVisits: number
  /** Time in counted visits. */
  activeMs: number
  /** Whole kilometres travelled in the day, for the active-time bonus. */
  travelMeters: number
  /** Paid time inside the person's hours. */
  workingMs: number
  /** The first visit was after the deadline and within reach of where the person clocked in. */
  lateNearFirstVisit: boolean
}

export interface DayScore {
  /** 0-10 with one decimal; null when there is no working time to judge (not clocked in). */
  score: number | null
  band: ScoreBand | null
  /** Each part as a 0-1 share of its own goal: what it contributes to the score. */
  visitShare: number
  hoursShare: number
  orderShare: number
  /** Each part as measured: active time over working time, orders over visits. */
  activeRatio: number
  orderRatio: number
  orderedVisits: number
  totalVisits: number
  effectiveVisits: number
  ineffectiveVisits: number
  visitTarget: number
  activeMs: number
  /** Hours added to active time for distance travelled. */
  travelBonusMs: number
  travelMeters: number
  workingMs: number
  /** The late-first-visit deduction applied. */
  lateDeduction: boolean
}

export function computeScore(i: ScoreInputs): DayScore {
  const visitRatio = i.visitTarget > 0 ? (i.effectiveVisits + INEFFECTIVE_VISIT_WEIGHT * i.ineffectiveVisits) / i.visitTarget : 0
  const travelBonusMs = Math.floor(i.travelMeters / 1000 / TRAVEL_KM_PER_ACTIVE_HOUR) * HOUR_MS
  const activeRatio = i.workingMs > 0 ? (i.activeMs + travelBonusMs) / i.workingMs : 0
  const orderRatio = i.totalVisits > 0 ? i.orderedVisits / i.totalVisits : 0
  const visitShare = Math.min(1, visitRatio / SCORE_GOAL_VISITS)
  const hoursShare = Math.min(1, activeRatio / SCORE_GOAL_ACTIVE)
  const orderShare = Math.min(1, orderRatio / SCORE_GOAL_ORDERS)
  let raw = ((visitShare + hoursShare + orderShare) / 3) * 10
  if (i.lateNearFirstVisit) raw *= LATE_FIRST_VISIT_SCORE_FACTOR
  const score = i.workingMs > 0 ? round1(Math.min(10, raw)) : null
  return {
    score,
    band: score == null ? null : scoreBand(score),
    visitShare,
    hoursShare,
    orderShare,
    activeRatio: Math.min(1, activeRatio),
    orderRatio: Math.min(1, orderRatio),
    orderedVisits: i.orderedVisits,
    totalVisits: i.totalVisits,
    effectiveVisits: i.effectiveVisits,
    ineffectiveVisits: i.ineffectiveVisits,
    visitTarget: i.visitTarget,
    activeMs: i.activeMs,
    travelBonusMs,
    travelMeters: i.travelMeters,
    workingMs: i.workingMs,
    lateDeduction: i.lateNearFirstVisit && score != null,
  }
}

/** The average score over days that have one, one decimal; null with none. */
export function meanScore(scores: (number | null | undefined)[]): number | null {
  const have = scores.filter((s): s is number => s != null)
  return have.length ? round1(have.reduce((a, b) => a + b, 0) / have.length) : null
}

interface SessionLike {
  clock_in_at: string
  clock_out_at: string | null
  clock_in_latitude?: number | null
  clock_in_longitude?: number | null
  clock_out_latitude?: number | null
  clock_out_longitude?: number | null
}

interface VisitLike {
  id?: string
  order_amount_usd?: number | null
  checked_in_at: string
  checked_out_at: string | null
  cancelled_at?: string | null
  flags?: string[] | null
  in_latitude?: number | null
  in_longitude?: number | null
}

/** Straight-line distance through the day: clock-ins, each visit's check-in point, clock-outs, in time order. */
export function travelMeters(sessions: SessionLike[], visits: VisitLike[]): number {
  const pts: { t: string; lat: number; lng: number }[] = []
  for (const a of sessions) {
    if (a.clock_in_latitude != null && a.clock_in_longitude != null) pts.push({ t: a.clock_in_at, lat: a.clock_in_latitude, lng: a.clock_in_longitude })
    if (a.clock_out_at && a.clock_out_latitude != null && a.clock_out_longitude != null) pts.push({ t: a.clock_out_at, lat: a.clock_out_latitude, lng: a.clock_out_longitude })
  }
  for (const v of visits) if (!v.cancelled_at && v.in_latitude != null && v.in_longitude != null) pts.push({ t: v.checked_in_at, lat: v.in_latitude, lng: v.in_longitude })
  pts.sort((a, b) => a.t.localeCompare(b.t))
  let m = 0
  for (let i = 1; i < pts.length; i++) m += distanceInMeters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng)
  return m
}

/**
 * Was the day's first visit after the deadline even though it was close to where
 * the person clocked in? Unknown positions never count against anyone.
 */
export function lateNearFirstVisit(sessions: SessionLike[], visits: VisitLike[], day: string, deadline: string): boolean {
  const first = [...visits].filter((v) => !v.cancelled_at).sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))[0]
  const clockIn = [...sessions].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))[0]
  if (!first || !clockIn) return false
  const deadlineMs = new Date(`${day}T${deadline.slice(0, 5)}:00+07:00`).getTime()
  if (new Date(first.checked_in_at).getTime() <= deadlineMs) return false
  if (clockIn.clock_in_latitude == null || clockIn.clock_in_longitude == null || first.in_latitude == null || first.in_longitude == null) return false
  return distanceInMeters(clockIn.clock_in_latitude, clockIn.clock_in_longitude, first.in_latitude, first.in_longitude) < NEAR_FIRST_VISIT_KM * 1000
}

/**
 * One person-day's score from its sessions and visits. `paidMs` is the server's
 * paid time for a finished day; without it, paid time is worked out from the sessions.
 */
export function scoreDay(
  sessions: SessionLike[],
  visits: VisitLike[],
  day: string,
  rule: BreakRule | null | undefined,
  now: number,
  rules: FlagRules,
  paidMs?: number,
  /** Each visit's order state (useVisitOrders). Without it, a visit with an order amount counts as ordered. */
  orders?: Record<string, OrderState>
): DayScore {
  const live = visits.filter((v) => !v.cancelled_at)
  const eff = dayEffectiveness(sessions, live, day, rule, now, rules, paidMs)
  let effective = 0
  let ineffective = 0
  for (const v of live) {
    if (creditedVisitMs(v, now, rules) > 0) effective += 1
    else ineffective += 1
  }
  return computeScore({
    effectiveVisits: effective,
    ineffectiveVisits: ineffective,
    visitTarget: scaledDailyTarget(rule, rules.visitTarget, rules.fullDayHours),
    orderedVisits: live.filter((v) => countsAsOrdered(orders ? (v.id ? orders[v.id] : undefined) : (v.order_amount_usd ?? 0) > 0 ? 'pending' : 'none')).length,
    totalVisits: live.length,
    activeMs: eff.creditedMs,
    travelMeters: travelMeters(sessions, live),
    workingMs: eff.scheduledPaidMs,
    lateNearFirstVisit: lateNearFirstVisit(sessions, live, day, rules.firstVisitDeadline),
  })
}

export type ScorePart = 'visits' | 'hours' | 'orders'

/** The part furthest from its goal, and what closing the gap takes. */
export interface ScoreFocus {
  part: ScorePart
  /** visits: more effective visits; hours: more active time in ms; orders: more ordered visits. */
  need: number
}

/**
 * What to work on next: the part of the day's score with the biggest gap to its
 * goal (ties go to visits, then hours, then orders), and how much it would take
 * to reach that goal. Null when every part has reached its goal.
 */
export function scoreFocus(d: DayScore): ScoreFocus | null {
  const parts: { part: ScorePart; share: number }[] = [
    { part: 'visits', share: d.visitShare },
    { part: 'hours', share: d.hoursShare },
    { part: 'orders', share: d.orderShare },
  ]
  const worst = parts.reduce((a, b) => (b.share < a.share ? b : a))
  if (worst.share >= 1) return null
  if (worst.part === 'visits') {
    const counted = d.effectiveVisits + INEFFECTIVE_VISIT_WEIGHT * d.ineffectiveVisits
    return { part: 'visits', need: Math.max(1, Math.ceil(d.visitTarget * SCORE_GOAL_VISITS - counted)) }
  }
  if (worst.part === 'hours') return { part: 'hours', need: Math.max(0, SCORE_GOAL_ACTIVE * d.workingMs - (d.activeMs + d.travelBonusMs)) }
  return { part: 'orders', need: Math.max(1, Math.ceil(SCORE_GOAL_ORDERS * d.totalVisits - d.orderedVisits)) }
}
