import { INEFFECTIVE_VISIT_WEIGHT, LATE_FIRST_VISIT_SCORE_FACTOR, SCORE_GOAL_ACTIVE, SCORE_GOAL_VISITS } from '@/lib/config'
import { countsAsOrdered, type OrderState } from '@/features/orders/orderReconcile'
import { distanceInMeters } from '@/lib/geo'
import { creditedVisitMs, dayEffectiveness, isLateClockIn, scaledDailyAmount, scaledDailyTarget, scheduledSoFarMs, type BreakRule } from './efficiency'
import { firstVisitDeadlineMs, type FlagRules, type TravelRule } from './flagRules'

/**
 * The effectiveness score, 0 to 10, for one person-day: the average of three
 * parts, each scored against its own goal and capped at 100% of it.
 *
 * - Visits: effective visits (completed and long enough to count) plus a quarter
 *   of the ineffective ones, over the day's visit target. Goal: 100% of target.
 * - Active hours: active time over working time in the person's hours. On a day that
 *   travels more than 25 km with a visit outside the home city, every full 10 km takes
 *   10 minutes off the working time (the travel isn't held against the person).
 *   Goal: 50% of working time.
 * - Orders: the value of the day's orders over the person's daily order target (scaled
 *   by the day's hours). Goal: 100% of target. A target of 0 leaves this part out.
 *
 * A person who clocks in late with no approved leave that day is measured against
 * their full working hours (or the schedule so far, while the day is still running),
 * so arriving late never shrinks the hours the score is judged against.
 *
 * A late first visit takes 10% off the score. The deadline is 30 minutes later when
 * the first stop is more than 10 km from where the person clocked in. (All the
 * numbers are settings; see FlagRules.)
 */

export type ScoreBand = 'poor' | 'average' | 'good' | 'excellent'

/** Under 5 is poor, 5 up to 7 average, 7 to 9 good, above 9 excellent. */
export function scoreBand(score: number): ScoreBand {
  if (score < 5) return 'poor'
  if (score < 7) return 'average'
  if (score <= 9) return 'good'
  return 'excellent'
}

export const BAND_LABEL: Record<ScoreBand, string> = { poor: 'Poor', average: 'Average', good: 'Good', excellent: 'Excellent' }

/** Each band's colour: poor red, average amber, good blue, excellent green. Text colours have dark-theme overrides. */
export const BAND_STYLE: Record<ScoreBand, { text: string; fill: string; soft: string }> = {
  poor: { text: 'text-status-danger', fill: 'bg-status-danger', soft: 'bg-status-danger/10' },
  average: { text: 'text-status-warn', fill: 'bg-status-warn', soft: 'bg-status-warn/10' },
  good: { text: 'text-brand-500', fill: 'bg-brand-500', soft: 'bg-brand-50' },
  excellent: { text: 'text-status-working', fill: 'bg-status-working', soft: 'bg-status-working/10' },
}

/** Text colour for a score by its band. */
export function scoreTextClass(score: number | null | undefined): string {
  return score == null ? 'text-neutral-900' : BAND_STYLE[scoreBand(score)].text
}

/** One decimal, like "7.8"; "—" without a score. */
export function formatScore(score: number | null | undefined): string {
  return score == null ? '—' : score.toFixed(1)
}

const round1 = (n: number) => Math.round(n * 10) / 10

export interface ScoreInputs {
  effectiveVisits: number
  ineffectiveVisits: number
  visitTarget: number
  /** Visits that count as ordered (confirmed, found in the sync, or marked and still pending), and all visits. */
  orderedVisits: number
  totalVisits: number
  /** Value of the day's orders in USD and the person's order target for the day (0: no target, the part is left out). */
  orderValueUsd: number
  orderTargetUsd: number
  /** Time in counted visits. */
  activeMs: number
  /** Metres travelled in the day. */
  travelMeters: number
  /** Time taken off working time for long travel outside the home city (travelDeductionMs). */
  travelDeductionMs: number
  /** Paid time inside the person's hours. */
  workingMs: number
  /** The first visit was after the deadline (moved out when it was far from the clock-in point). */
  lateFirstVisit: boolean
  /** Working time was set to the full working hours because the person clocked in late with no approved leave. */
  lateFullHours?: boolean
}

export interface DayScore {
  /** 0-10 with one decimal; null when there is no working time to judge (not clocked in). */
  score: number | null
  band: ScoreBand | null
  /** Each part as a 0-1 share of its own goal: what it contributes to the score. */
  visitShare: number
  hoursShare: number
  orderShare: number
  /** Each part as measured: active time over working time, orders over visits (for display). */
  activeRatio: number
  orderRatio: number
  orderedVisits: number
  totalVisits: number
  orderValueUsd: number
  orderTargetUsd: number
  effectiveVisits: number
  ineffectiveVisits: number
  visitTarget: number
  activeMs: number
  /** Time taken off working time for long travel outside the home city. */
  travelDeductionMs: number
  travelMeters: number
  workingMs: number
  /** The late-first-visit deduction applied. */
  lateDeduction: boolean
  /** Late clock-in with no approved leave: the full working hours are what active time is measured against. */
  lateFullHours: boolean
}

export function computeScore(i: ScoreInputs): DayScore {
  const visitRatio = i.visitTarget > 0 ? (i.effectiveVisits + INEFFECTIVE_VISIT_WEIGHT * i.ineffectiveVisits) / i.visitTarget : 0
  const travelDeductionMs = Math.min(i.workingMs, i.travelDeductionMs)
  const workingAfterTravel = i.workingMs - travelDeductionMs
  const activeRatio = workingAfterTravel > 0 ? i.activeMs / workingAfterTravel : i.activeMs > 0 ? 1 : 0
  const orderRatio = i.totalVisits > 0 ? i.orderedVisits / i.totalVisits : 0
  const visitShare = Math.min(1, visitRatio / SCORE_GOAL_VISITS)
  const hoursShare = Math.min(1, activeRatio / SCORE_GOAL_ACTIVE)
  const hasOrderTarget = i.orderTargetUsd > 0
  const orderShare = hasOrderTarget ? Math.min(1, i.orderValueUsd / i.orderTargetUsd) : 0
  let raw = hasOrderTarget ? ((visitShare + hoursShare + orderShare) / 3) * 10 : ((visitShare + hoursShare) / 2) * 10
  if (i.lateFirstVisit) raw *= LATE_FIRST_VISIT_SCORE_FACTOR
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
    orderValueUsd: i.orderValueUsd,
    orderTargetUsd: i.orderTargetUsd,
    effectiveVisits: i.effectiveVisits,
    ineffectiveVisits: i.ineffectiveVisits,
    visitTarget: i.visitTarget,
    activeMs: i.activeMs,
    travelDeductionMs,
    travelMeters: i.travelMeters,
    workingMs: i.workingMs,
    lateDeduction: i.lateFirstVisit && score != null,
    lateFullHours: !!i.lateFullHours && score != null,
  }
}

/** The inputs a day's score was computed from, rebuilt from the result (for nextSteps). */
export function inputsOf(d: DayScore): ScoreInputs {
  return {
    effectiveVisits: d.effectiveVisits,
    ineffectiveVisits: d.ineffectiveVisits,
    visitTarget: d.visitTarget,
    orderedVisits: d.orderedVisits,
    totalVisits: d.totalVisits,
    orderValueUsd: d.orderValueUsd,
    orderTargetUsd: d.orderTargetUsd,
    activeMs: d.activeMs,
    travelMeters: d.travelMeters,
    travelDeductionMs: d.travelDeductionMs,
    workingMs: d.workingMs,
    lateFirstVisit: d.lateDeduction,
    lateFullHours: d.lateFullHours,
  }
}

/** The next band above `score` and the lowest score that reaches it (bands are cut at 5, 7 and above 9). */
export function nextBand(score: number): { band: ScoreBand; at: number } | null {
  if (score < 5) return { band: 'average', at: 5 }
  if (score < 7) return { band: 'good', at: 7 }
  if (score <= 9) return { band: 'excellent', at: 9.1 }
  return null
}

export interface NextStep {
  kind: 'visit' | 'order'
  /** How many more visits, or how many more orders of `orderUsd` each. */
  count: number
  orderUsd?: number
  /** The score if the person did that. */
  score: number
  /** It reaches the next band. */
  reaches: boolean
}

/**
 * What would lift the day's score: the smallest number of extra visits, and of extra orders, that
 * reaches the next band (or, when neither can within a few, the best single step). One result each,
 * visits first. A visit adds the day's average visit time to active time. An order is worth a
 * quarter of the day's target, rounded to $50, at least $50.
 */
export function nextSteps(i: ScoreInputs, maxMore = 5): { next: { band: ScoreBand; at: number } | null; steps: NextStep[] } {
  const now = computeScore(i)
  if (now.score == null) return { next: null, steps: [] }
  const next = nextBand(now.score)
  if (!next) return { next: null, steps: [] }
  const avgVisitMs = i.effectiveVisits > 0 ? i.activeMs / i.effectiveVisits : 20 * 60_000
  const orderUsd = Math.max(50, Math.round((i.orderTargetUsd * 0.25) / 50) * 50)
  const pick = (kind: 'visit' | 'order'): NextStep | null => {
    let best: NextStep | null = null
    for (let n = 1; n <= maxMore; n++) {
      const more: ScoreInputs =
        kind === 'visit'
          ? { ...i, effectiveVisits: i.effectiveVisits + n, totalVisits: i.totalVisits + n, activeMs: i.activeMs + n * avgVisitMs }
          : { ...i, orderedVisits: i.orderedVisits + n, orderValueUsd: i.orderValueUsd + n * orderUsd }
      const score = computeScore(more).score ?? 0
      const step: NextStep = { kind, count: n, orderUsd: kind === 'order' ? orderUsd : undefined, score, reaches: score >= next.at }
      if (score <= (now.score ?? 0)) continue
      if (step.reaches) return step
      best = step
    }
    return best
  }
  const steps = [pick('visit'), i.orderTargetUsd > 0 ? pick('order') : null].filter((x): x is NextStep => !!x)
  return { next, steps }
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
 * Metres from where the person clocked in to the day's first visit; null when either
 * position is unknown.
 */
export function firstVisitDistanceM(sessions: SessionLike[], visits: VisitLike[]): number | null {
  const first = [...visits].filter((v) => !v.cancelled_at).sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))[0]
  const clockIn = [...sessions].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))[0]
  if (!first || !clockIn || clockIn.clock_in_latitude == null || clockIn.clock_in_longitude == null || first.in_latitude == null || first.in_longitude == null) return null
  return distanceInMeters(clockIn.clock_in_latitude, clockIn.clock_in_longitude, first.in_latitude, first.in_longitude)
}

/**
 * Was the day's first visit after the deadline? The deadline moves out when the first
 * stop is more than the far distance from where the person clocked in. An unknown
 * position keeps the plain deadline.
 */
export function lateFirstVisit(sessions: SessionLike[], visits: VisitLike[], day: string, rules: Pick<FlagRules, 'firstVisitDeadline' | 'firstVisitFar'>): boolean {
  const first = [...visits].filter((v) => !v.cancelled_at).sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))[0]
  if (!first) return false
  return new Date(first.checked_in_at).getTime() > firstVisitDeadlineMs(day, rules.firstVisitDeadline, rules.firstVisitFar, firstVisitDistanceM(sessions, visits))
}

/**
 * Time off the working hours for long travel: on a day travelling more than `minKm`
 * with a visit outside the home city, every full `stepKm` takes `minutes`.
 */
export function travelDeductionMs(meters: number, visits: VisitLike[], rule: TravelRule | undefined): number {
  if (!rule?.enabled || rule.minutes <= 0 || meters / 1000 <= rule.minKm) return 0
  const outside = visits.some(
    (v) => !v.cancelled_at && v.in_latitude != null && v.in_longitude != null && distanceInMeters(rule.homeLat, rule.homeLng, v.in_latitude, v.in_longitude) > rule.homeRadiusKm * 1000
  )
  return outside ? Math.floor(meters / 1000 / rule.stepKm) * rule.minutes * 60_000 : 0
}

export interface ScoreDayOptions {
  /** Approved leave covering the day (0 none, 0.5 half day, 1 full): a late clock-in is only held against the person when there is none. */
  leaveFraction?: number
  /** Clocked in late, when the server already says so; otherwise worked out from the first clock-in, the person's start time and the grace period. */
  late?: boolean
  /** The person's unpaid break, when `rule` carries the server's paid time instead (its break is zeroed). */
  breakRule?: Pick<BreakRule, 'breakMinutes' | 'breakPaid'> | null
  /** The person's own daily order target in USD for a full working day; without it the company default (`rules.orderTargetUsd`). */
  orderTargetUsd?: number | null
  /** The synced sale order matched to each visit (useVisitOrderTotals): its total is the order's value, counted once per order number. */
  orderTotals?: Record<string, { orderNo: string; totalUsd: number | null }>
}

/**
 * The value in USD of the visits that count as ordered: a synced sale order's total when one
 * matched (counted once however many visits matched it), else the amount the person entered.
 */
export function orderValueUsd(
  visits: VisitLike[],
  orders: Record<string, OrderState> | undefined,
  totals: Record<string, { orderNo: string; totalUsd: number | null }> | undefined
): number {
  const seen = new Set<string>()
  let sum = 0
  for (const v of visits) {
    if (v.cancelled_at) continue
    const state = orders ? (v.id ? orders[v.id] : undefined) : (v.order_amount_usd ?? 0) > 0 ? 'pending' : 'none'
    if (!countsAsOrdered(state)) continue
    const match = v.id ? totals?.[v.id] : undefined
    if (match) {
      if (seen.has(match.orderNo)) continue
      seen.add(match.orderNo)
      sum += match.totalUsd ?? v.order_amount_usd ?? 0
    } else {
      sum += v.order_amount_usd ?? 0
    }
  }
  return sum
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
  orders?: Record<string, OrderState>,
  opts: ScoreDayOptions = {}
): DayScore {
  const live = visits.filter((v) => !v.cancelled_at)
  const eff = dayEffectiveness(sessions, live, day, rule, now, rules, paidMs)
  let effective = 0
  let ineffective = 0
  for (const v of live) {
    if (creditedVisitMs(v, now, rules) > 0) effective += 1
    else ineffective += 1
  }
  const meters = travelMeters(sessions, live)
  // Late with no approved leave: judged against the full working hours, not the shorter time they were clocked in.
  const late = opts.late ?? isLateClockIn(sessions, day, rule, rules.lateGraceMin)
  const fullRule = rule && opts.breakRule ? { ...rule, ...opts.breakRule } : rule
  const fullHoursMs = late && !(opts.leaveFraction && opts.leaveFraction > 0) ? scheduledSoFarMs(day, fullRule, now) : 0
  const lateFullHours = fullHoursMs > eff.scheduledPaidMs
  return computeScore({
    effectiveVisits: effective,
    ineffectiveVisits: ineffective,
    visitTarget: scaledDailyTarget(rule, rules.visitTarget, rules.fullDayHours),
    orderedVisits: live.filter((v) => countsAsOrdered(orders ? (v.id ? orders[v.id] : undefined) : (v.order_amount_usd ?? 0) > 0 ? 'pending' : 'none')).length,
    totalVisits: live.length,
    orderValueUsd: orderValueUsd(live, orders, opts.orderTotals),
    orderTargetUsd: scaledDailyAmount(rule, opts.orderTargetUsd ?? rules.orderTargetUsd, rules.fullDayHours),
    activeMs: eff.creditedMs,
    travelMeters: meters,
    travelDeductionMs: travelDeductionMs(meters, live, rules.travel),
    workingMs: lateFullHours ? fullHoursMs : eff.scheduledPaidMs,
    lateFirstVisit: lateFirstVisit(sessions, live, day, rules),
    lateFullHours,
  })
}
