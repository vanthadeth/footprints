import { creditedVisitMs, dayEffectiveness, paidWorkMs, uniqueCustomerTarget, type BreakRule } from './efficiency'
import { DEFAULT_FLAG_RULES, isFlaggedGap, visitSpan, type FlagRules } from './flagRules'
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
export function computeJourneyStats(days: DayJourney[], now: number = Date.now(), rule?: BreakRule | null, flags: FlagRules = DEFAULT_FLAG_RULES): JourneyStats {
  let totalWorkingMs = 0
  let totalPaidMs = 0
  let scheduledMs = 0
  let creditedMs = 0
  let uniqueCustomers = 0
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
    uniqueCustomers += new Set(sorted.map((v) => v.customer_id).filter((id): id is string => !!id)).size
    const noteFlaggedGap = (from: number, to: number) => {
      if (isFlaggedGap(from, to, flags.idle)) {
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
