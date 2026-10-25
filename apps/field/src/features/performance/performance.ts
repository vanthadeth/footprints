/**
 * Team performance for one day: each person's sales against their own daily target,
 * judged against how much of their shift has passed. Pure functions; the page feeds them.
 */

export type PerfStatus = 'ahead' | 'pace' | 'behind' | 'away'

/** At or above this share of the expected sales so far a person is ahead; below AT_PACE they are behind. */
export const AHEAD_AT = 1.15
export const AT_PACE = 0.9

/** The share of the shift that has passed at `now`, from 0 (not started) to 1 (over). */
export function shiftShare(now: number, start: number, end: number): number {
  if (!(end > start)) return 0
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}

/** What a person should have sold by now: the daily target times the share of the shift that has passed. */
export function expectedSoFar(targetUsd: number, share: number): number {
  return Math.max(0, targetUsd) * share
}

/** Ahead, on pace or behind, by sales against the expected sales so far. Before the shift starts nobody is behind. */
export function classify(salesUsd: number, targetUsd: number, share: number): Exclude<PerfStatus, 'away'> {
  const expected = expectedSoFar(targetUsd, share)
  if (expected <= 0) return salesUsd > 0 ? 'ahead' : 'pace'
  const rel = salesUsd / expected
  return rel >= AHEAD_AT ? 'ahead' : rel >= AT_PACE ? 'pace' : 'behind'
}

/** How far below the expected sales so far, in whole dollars (0 when at or above). */
export function behindByUsd(salesUsd: number, targetUsd: number, share: number): number {
  return Math.max(0, Math.round(expectedSoFar(targetUsd, share) - salesUsd))
}

/** Share of the daily target sold, as a whole percent (0 without a target). */
export function percentOfTarget(salesUsd: number, targetUsd: number): number {
  return targetUsd > 0 ? Math.round((salesUsd / targetUsd) * 100) : 0
}

export interface PerfRow {
  id: string
  name: string
  status: PerfStatus
  /** Why a person has no figures today. */
  away?: 'absent' | 'leave'
  salesUsd: number
  targetUsd: number
  visits: number
  /** Share of the shift passed, 0 to 1. */
  share: number
}

const RANK: Record<PerfStatus, number> = { behind: 0, pace: 1, ahead: 2, away: 3 }

/** People who need attention first: furthest behind pace, then on pace, then ahead (most sold first), then away (absent before leave). */
export function sortRows(rows: PerfRow[]): PerfRow[] {
  const rel = (r: PerfRow) => {
    const e = expectedSoFar(r.targetUsd, r.share)
    return e > 0 ? r.salesUsd / e : r.salesUsd > 0 ? Infinity : 1
  }
  return [...rows].sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status]
    if (a.status === 'away') {
      const aw = (a.away === 'absent' ? 0 : 1) - (b.away === 'absent' ? 0 : 1)
      if (aw) return aw
    } else if (a.status === 'behind') {
      const d = rel(a) - rel(b)
      if (d) return d
    } else {
      const d = b.salesUsd - a.salesUsd
      if (d) return d
    }
    return a.name.localeCompare(b.name)
  })
}

export function countByStatus(rows: PerfRow[]): Record<PerfStatus, number> {
  const out: Record<PerfStatus, number> = { ahead: 0, pace: 0, behind: 0, away: 0 }
  for (const r of rows) out[r.status]++
  return out
}
