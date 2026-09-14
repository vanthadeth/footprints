import type { DayJourney } from './useJourneyHistory'

export interface JourneyStats {
  workingDays: number
  totalWorkingMs: number
  totalVisits: number
  totalVisitingMs: number
  averageVisitMs: number
  totalGapMs: number
  unassignedVisits: number
  autoCheckouts: number
  flaggedVisits: number
}

/**
 * Aggregate stats over a set of days (spec §29-30, §39). Pure function so
 * the gap/duration math -- easy to get subtly wrong -- is unit-testable
 * without a database.
 */
export function computeJourneyStats(days: DayJourney[], now: number = Date.now()): JourneyStats {
  let totalWorkingMs = 0
  let totalVisits = 0
  let totalVisitingMs = 0
  let totalGapMs = 0
  let unassignedVisits = 0
  let autoCheckouts = 0
  let flaggedVisits = 0
  let workingDays = 0

  for (const day of days) {
    if (day.attendance.length > 0) {
      workingDays += 1
      // A day can have more than one clock-in/clock-out session -- sum
      // working time across all of them, not just the first.
      for (const session of day.attendance) {
        const start = new Date(session.clock_in_at).getTime()
        const end = session.clock_out_at ? new Date(session.clock_out_at).getTime() : now
        totalWorkingMs += Math.max(0, end - start)
      }
    }

    const sorted = [...day.visits].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
    for (let i = 0; i < sorted.length; i++) {
      const visit = sorted[i]
      totalVisits += 1
      if (!visit.customer_id) unassignedVisits += 1
      if (visit.auto_closed) autoCheckouts += 1
      if (visit.flags && visit.flags.length > 0) flaggedVisits += 1

      const visitStart = new Date(visit.checked_in_at).getTime()
      const visitEnd = visit.checked_out_at ? new Date(visit.checked_out_at).getTime() : now
      totalVisitingMs += Math.max(0, visitEnd - visitStart)

      const prev = sorted[i - 1]
      if (prev?.checked_out_at) {
        const gap = visitStart - new Date(prev.checked_out_at).getTime()
        if (gap > 0) totalGapMs += gap
      }
    }
  }

  return {
    workingDays,
    totalWorkingMs,
    totalVisits,
    totalVisitingMs,
    averageVisitMs: totalVisits > 0 ? totalVisitingMs / totalVisits : 0,
    totalGapMs,
    unassignedVisits,
    autoCheckouts,
    flaggedVisits,
  }
}
