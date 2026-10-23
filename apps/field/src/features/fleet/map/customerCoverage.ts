export type CoverageStatus = 'visited' | 'unvisited' | 'overdue'

export interface CoverageInput {
  id: string
  /** "YYYY-MM-DD" from the customer directory, or null if never visited. */
  lastVisitDate: string | null
}

export interface CoverageResult {
  status: CoverageStatus
  /** Days since the most recent known visit, null if never. */
  daysSince: number | null
}

function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * Visited = someone on the team checked in there during the chosen period.
 * Otherwise overdue once the last visit is more than `dueAfterDays` ago (or
 * it's never been visited), else simply not visited yet. `latestVisitById`
 * is the newest visit date seen in the fetched visits, which wins over the
 * directory's last_visit_date when it's more recent.
 */
export function classifyCoverage(
  customers: CoverageInput[],
  visitedIds: Set<string>,
  latestVisitById: Record<string, string>,
  today: string,
  dueAfterDays: number
): Record<string, CoverageResult> {
  const out: Record<string, CoverageResult> = {}
  for (const c of customers) {
    const candidates = [c.lastVisitDate, latestVisitById[c.id]].filter((d): d is string => !!d)
    const sorted = [...candidates].sort()
    const last = sorted.length ? sorted[sorted.length - 1] : null
    const daysSince = last ? Math.max(0, dayDiff(last, today)) : null
    const status: CoverageStatus = visitedIds.has(c.id) ? 'visited' : daysSince === null || daysSince > dueAfterDays ? 'overdue' : 'unvisited'
    out[c.id] = { status, daysSince }
  }
  return out
}
