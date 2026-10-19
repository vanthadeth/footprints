import { FULL_SCORE_AT, INEFFECTIVE_VISIT_WEIGHT, LATE_FIRST_VISIT_SCORE_FACTOR, NEAR_FIRST_VISIT_KM, TRAVEL_KM_PER_ACTIVE_HOUR } from '@/lib/config'
import { distanceInMeters } from '@/lib/geo'
import { creditedVisitMs, dayEffectiveness, scaledDailyTarget, type BreakRule } from './efficiency'
import type { FlagRules } from './flagRules'

/**
 * The effectiveness score, 0 to 10, for one person-day: the average of two parts.
 *
 * - Visits: effective visits (completed and long enough to count) plus a quarter
 *   of the ineffective ones, over the day's visit target. Capped at 100%.
 * - Hours: active time over working time in the person's hours, where every full
 *   50 km travelled adds an hour to active time. Capped at 100%.
 *
 * An average of 50% earns the full 10.0 (scaled linearly below it). A first visit
 * after the deadline that is within 10 km of where the person clocked in, so
 * distance doesn't explain it, takes 10% off the score.
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
  /** Each part as a 0-1 share. */
  visitShare: number
  hoursShare: number
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
  const visitShare = i.visitTarget > 0 ? Math.min(1, (i.effectiveVisits + INEFFECTIVE_VISIT_WEIGHT * i.ineffectiveVisits) / i.visitTarget) : 0
  const travelBonusMs = Math.floor(i.travelMeters / 1000 / TRAVEL_KM_PER_ACTIVE_HOUR) * HOUR_MS
  const hoursShare = i.workingMs > 0 ? Math.min(1, (i.activeMs + travelBonusMs) / i.workingMs) : 0
  let raw = ((visitShare + hoursShare) / 2 / FULL_SCORE_AT) * 10
  if (i.lateNearFirstVisit) raw *= LATE_FIRST_VISIT_SCORE_FACTOR
  const score = i.workingMs > 0 ? round1(Math.min(10, raw)) : null
  return {
    score,
    band: score == null ? null : scoreBand(score),
    visitShare,
    hoursShare,
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
export function scoreDay(sessions: SessionLike[], visits: VisitLike[], day: string, rule: BreakRule | null | undefined, now: number, rules: FlagRules, paidMs?: number): DayScore {
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
    activeMs: eff.creditedMs,
    travelMeters: travelMeters(sessions, live),
    workingMs: eff.scheduledPaidMs,
    lateNearFirstVisit: lateNearFirstVisit(sessions, live, day, rules.firstVisitDeadline),
  })
}
