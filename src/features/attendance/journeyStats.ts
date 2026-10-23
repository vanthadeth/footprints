import { creditedVisitMs, dayEffectiveness, paidWorkMs, uniqueCustomerTarget, type BreakRule } from './efficiency'
import { DEFAULT_FLAG_RULES, FORGOTTEN_VISIT_FLAGS, isFlaggedGap, visitSpan, type FlagRules } from './flagRules'
import { geoPoints, gapDistanceM } from './gapDistance'
import { meanScore, scoreDay, type DayScore } from './effectivenessScore'
import { countsAsOrdered, type OrderState } from '@/features/orders/orderReconcile'
import type { DayJourney } from './useJourneyHistory'

export interface JourneyStats {
  workingDays: number
  /** Time clocked in. */
  totalWorkingMs: number
  /** Paid working time: clocked in less the unpaid break (the efficiency denominator). Equals totalWorkingMs when no break rule is given. */
  totalPaidMs: number
  /** Paid time inside the person's own hours: the efficiency denominator. */
  scheduledPaidMs: number
  totalVisits: number
  totalVisitingMs: number
  /** Visit time that counts toward effectiveness: short visits count nothing, long ones are capped. The efficiency numerator. */
  creditedVisitMs: number
  /** Visits that count toward effectiveness; the rest (under the short-visit limit) are not credited. */
  creditedVisits: number
  /** Visits that count as ordered: confirmed by a synced sale order, found in one, or marked and still waiting for one. */
  orderedVisits: number
  /** Of those, confirmed or found by a synced sale order, and still waiting. Plus marks that no order matched once the window closed (not counted). */
  ordersSynced: number
  ordersPending: number
  ordersUnmatched: number
  /** Visits nobody checked out of (closed at clock-out or end of day), and sessions nobody clocked out of (closed automatically). */
  forgottenCheckouts: number
  forgottenClockOuts: number
  /** The effectiveness score, 0-10: the average over days with working time. */
  score: number | null
  /** Each day's score and its parts, in day order (days with attendance only). */
  dayScores: DayScore[]
  /** Unique customers visited, summed over days (a customer seen on two days counts on each). */
  uniqueCustomers: number
  /** Unique customers expected over the same days, each day scaled by its scheduled hours. */
  uniqueCustomerTarget: number
  averageVisitMs: number
  /** Time between consecutive visits. */
  totalGapMs: number
  /** Idle time under the flag rules: gaps after a visit longer than the idle limit, including the time after the last check-out to clock-out (or now). */
  flaggedGapMs: number
  flaggedGaps: number
  unassignedVisits: number
  autoCheckouts: number
  flaggedVisits: number
}

/**
 * Aggregate stats over a set of days (spec §29-30, §39). Pure function so
 * the gap/duration math -- easy to get subtly wrong -- is unit-testable
 * without a database. `rule` is the person's unpaid break, for paid time;
 * `flags` are the flag rules (idle limit, forgotten-visit cap).
 */
export function computeJourneyStats(
  days: DayJourney[],
  now: number = Date.now(),
  rule?: BreakRule | null,
  flags: FlagRules = DEFAULT_FLAG_RULES,
  /** Each visit's order state (useVisitOrders). Without it, a visit with an order amount counts as ordered. */
  orders?: Record<string, OrderState>,
  /** A day's own hours and the server's paid time for it, when they differ from `rule` (a report over several days). */
  dayContext?: (date: string) => { rule?: BreakRule | null; paidMs?: number; leaveFraction?: number; late?: boolean; breakRule?: BreakRule | null } | undefined,
  /** The person's own daily order target (USD) and the synced sale order matched to each visit (useVisitOrderTotals), for the orders part of the score. */
  scoring?: { orderTargetUsd?: number | null; orderTotals?: Record<string, { orderNo: string; totalUsd: number | null }> }
): JourneyStats {
  let totalWorkingMs = 0
  let totalPaidMs = 0
  let scheduledMs = 0
  let creditedMs = 0
  let uniqueCustomers = 0
  const dayScores: DayScore[] = []
  let creditedVisits = 0
  let orderedVisits = 0
  let ordersSynced = 0
  let ordersPending = 0
  let ordersUnmatched = 0
  let forgottenCheckouts = 0
  let forgottenClockOuts = 0
  let uniqueTarget = 0
  let totalVisits = 0
  let totalVisitingMs = 0
  let totalGapMs = 0
  let flaggedGapMs = 0
  let flaggedGaps = 0
  let unassignedVisits = 0
  let autoCheckouts = 0
  let flaggedVisits = 0
  let workingDays = 0

  for (const day of days) {
    if (day.attendance.length > 0) {
      workingDays += 1
      const paid = paidWorkMs(day.attendance, now, rule)
      totalPaidMs += paid
      scheduledMs += dayEffectiveness(day.attendance, day.visits.filter((v) => !v.cancelled_at), day.date, rule, now, flags, paid).scheduledPaidMs
      uniqueTarget += uniqueCustomerTarget(rule, flags)
      const ctx = dayContext?.(day.date)
      dayScores.push(scoreDay(day.attendance, day.visits, day.date, ctx?.rule ?? rule, now, flags, ctx?.paidMs, orders, { leaveFraction: ctx?.leaveFraction, late: ctx?.late, breakRule: ctx?.breakRule, orderTargetUsd: scoring?.orderTargetUsd, orderTotals: scoring?.orderTotals }))
      forgottenClockOuts += day.attendance.filter((s) => s.auto_clocked_out).length
      // A day can have more than one clock-in/clock-out session -- sum
      // working time across all of them, not just the first.
      for (const session of day.attendance) {
        const start = new Date(session.clock_in_at).getTime()
        const end = session.clock_out_at ? new Date(session.clock_out_at).getTime() : now
        totalWorkingMs += Math.max(0, end - start)
      }
    }

    // A voided visit never happened -- excluded from every count/duration/
    // gap below, same as a still-open visit that gets cancelled outright
    // (cancelVisit) already never appears here at all.
    const sorted = [...day.visits].filter((v) => !v.cancelled_at).sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
    creditedMs += sorted.reduce((n, v) => n + creditedVisitMs(v, now, flags), 0)
    creditedVisits += sorted.filter((v) => creditedVisitMs(v, now, flags) > 0).length
    for (const v of sorted) {
      const state = orders ? (orders[v.id] ?? 'none') : (v.order_amount_usd ?? 0) > 0 ? 'pending' : 'none'
      if (countsAsOrdered(state)) orderedVisits += 1
      if (state === 'confirmed' || state === 'synced') ordersSynced += 1
      if (state === 'pending') ordersPending += 1
      if (state === 'unmatched') ordersUnmatched += 1
    }
    forgottenCheckouts += sorted.filter((v) => v.flags?.some((f) => FORGOTTEN_VISIT_FLAGS.includes(f))).length
    uniqueCustomers += new Set(sorted.map((v) => v.customer_id).filter((id): id is string => !!id)).size
    const points = geoPoints(day.attendance, sorted, now, flags.forgottenCapMin)
    const noteFlaggedGap = (from: number, to: number) => {
      if (isFlaggedGap(from, to, flags.idle, gapDistanceM(points, from, to))) {
        flaggedGapMs += to - from
        flaggedGaps += 1
      }
    }
    for (let i = 0; i < sorted.length; i++) {
      const visit = sorted[i]
      totalVisits += 1
      if (!visit.customer_id) unassignedVisits += 1
      if (visit.auto_closed) autoCheckouts += 1
      if (visit.flags && visit.flags.length > 0) flaggedVisits += 1

      // A visit nobody checked out of counts at most the cap; the rest is a gap.
      const [visitStart, visitEnd] = visitSpan(visit, now, flags.forgottenCapMin)
      totalVisitingMs += visitEnd - visitStart

      const prev = sorted[i - 1]
      if (prev?.checked_out_at) {
        const prevEnd = visitSpan(prev, now, flags.forgottenCapMin)[1]
        const gap = visitStart - prevEnd
        if (gap > 0) {
          totalGapMs += gap
          noteFlaggedGap(prevEnd, visitStart)
        }
      }
    }
    // The time after the last check-out, to the last clock-out (or now while still clocked in), is idle too.
    const last = sorted[sorted.length - 1]
    if (last?.checked_out_at && day.attendance.length > 0) {
      const lastEnd = visitSpan(last, now, flags.forgottenCapMin)[1]
      const dayEnd = day.attendance.some((s) => !s.clock_out_at) ? now : Math.max(...day.attendance.map((s) => new Date(s.clock_out_at!).getTime()))
      if (dayEnd > lastEnd) noteFlaggedGap(lastEnd, dayEnd)
    }
  }

  return {
    workingDays,
    totalWorkingMs,
    totalPaidMs,
    scheduledPaidMs: scheduledMs,
    totalVisits,
    totalVisitingMs,
    creditedVisitMs: creditedMs,
    score: meanScore(dayScores.map((d) => d.score)),
    dayScores,
    creditedVisits,
    orderedVisits,
    ordersSynced,
    ordersPending,
    ordersUnmatched,
    forgottenCheckouts,
    forgottenClockOuts,
    uniqueCustomers,
    uniqueCustomerTarget: uniqueTarget,
    averageVisitMs: totalVisits > 0 ? totalVisitingMs / totalVisits : 0,
    totalGapMs,
    flaggedGapMs,
    flaggedGaps,
    unassignedVisits,
    autoCheckouts,
    flaggedVisits,
  }
}
