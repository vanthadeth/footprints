import { APP_TIMEZONE } from '@/lib/config'
import type { JourneyStats } from '@/features/attendance/journeyStats'

export type ReportPeriod = 'today' | 'week' | 'month'

export interface Bucket {
  label: string
  /** null = still in the future (drawn as an empty stub, not a zero bar). */
  value: number | null
  current: boolean
}

interface VisitLike {
  checked_in_at: string
  cancelled_at?: string | null
  customer_id?: string | null
}

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  /** Monday = 0 .. Sunday = 6 */
  weekday: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function zonedParts(iso: string, timezone: string = APP_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  }
}

/** Days since the Unix epoch for a calendar date -- lets two dates be compared/differenced without a timezone. */
function dayNumber(p: { year: number; month: number; day: number }): number {
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)
}

const HOUR_START = 7
const HOUR_END = 18 // exclusive

function hourLabel(h: number): string {
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

/**
 * Visit counts bucketed for the Report chart: by hour (07:00-18:00) for
 * Today, by weekday for This Week, and by week-of-month (W1 = days 1-7 …)
 * for This Month. Buckets after "now" are null so the chart can draw them
 * as stubs instead of misleading zeros.
 */
export function visitBuckets(period: ReportPeriod, visits: VisitLike[], nowIso: string, timezone: string = APP_TIMEZONE): Bucket[] {
  const now = zonedParts(nowIso, timezone)
  const counted = visits.filter((v) => !v.cancelled_at).map((v) => zonedParts(v.checked_in_at, timezone))

  if (period === 'today') {
    const buckets: Bucket[] = []
    for (let h = HOUR_START; h < HOUR_END; h++) {
      const value = counted.filter((p) => dayNumber(p) === dayNumber(now) && (p.hour === h || (h === HOUR_START && p.hour < HOUR_START) || (h === HOUR_END - 1 && p.hour >= HOUR_END))).length
      buckets.push({ label: hourLabel(h), value: h > now.hour ? null : value, current: h === now.hour })
    }
    return buckets
  }

  if (period === 'week') {
    const monday = dayNumber(now) - now.weekday
    return WEEKDAYS.map((label, i) => {
      const value = counted.filter((p) => dayNumber(p) === monday + i).length
      return { label, value: i > now.weekday ? null : value, current: i === now.weekday }
    })
  }

  const daysInMonth = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate()
  const weekCount = Math.ceil(daysInMonth / 7)
  const currentWeek = Math.floor((now.day - 1) / 7)
  return Array.from({ length: weekCount }, (_, w) => {
    const value = counted.filter((p) => p.year === now.year && p.month === now.month && Math.floor((p.day - 1) / 7) === w).length
    return { label: `W${w + 1}`, value: w > currentWeek ? null : value, current: w === currentWeek }
  })
}

/** Mean over the buckets that have happened (null ones excluded), for the chart's dashed average line. */
export function bucketAverage(buckets: Bucket[]): number {
  const past = buckets.filter((b) => b.value !== null)
  if (past.length === 0) return 0
  return past.reduce((a, b) => a + (b.value ?? 0), 0) / past.length
}

/** Visits per customer, most first -- unassigned and cancelled visits don't count. */
export function topCustomers(visits: VisitLike[], limit = 3): { customerId: string; visits: number }[] {
  const counts = new Map<string, number>()
  for (const v of visits) {
    if (v.cancelled_at || !v.customer_id) continue
    counts.set(v.customer_id, (counts.get(v.customer_id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([customerId, n]) => ({ customerId, visits: n }))
    .sort((a, b) => b.visits - a.visits || a.customerId.localeCompare(b.customerId))
    .slice(0, limit)
}

/** Share of working time spent inside a visit, 0-1. */
export function effectiveness(stats: Pick<JourneyStats, 'totalVisitingMs' | 'totalWorkingMs'>): number {
  return stats.totalWorkingMs > 0 ? Math.min(1, stats.totalVisitingMs / stats.totalWorkingMs) : 0
}

const PREVIOUS_LABEL: Record<ReportPeriod, string> = { today: 'this time yesterday', week: 'this point last week', month: 'this point last month' }

/**
 * Trims the previous period to the same elapsed time as the current one
 * (Mon–Thu this week vs Mon–Thu last week, not a whole week), so a
 * mid-period comparison isn't lopsided. Returns the ISO cutoff to filter
 * the previous period's rows by.
 */
export function comparableCutoff(currentStartIso: string, previousStartIso: string, nowIso: string, previousEndIso: string): string {
  const elapsed = new Date(nowIso).getTime() - new Date(currentStartIso).getTime()
  const cutoff = new Date(previousStartIso).getTime() + Math.max(0, elapsed)
  return new Date(Math.min(cutoff, new Date(previousEndIso).getTime())).toISOString()
}

/** The one-sentence "Highlight" comparing visit counts with the same point in the previous period. */
export function highlightSentence(period: ReportPeriod, current: number, previous: number): string {
  const diff = current - previous
  const prev = PREVIOUS_LABEL[period]
  if (current === 0 && previous === 0) return `No visits yet — nothing to compare with ${prev}.`
  if (diff === 0) return `Same number of visits as ${prev}.`
  const n = Math.abs(diff)
  return `You made ${n} ${diff > 0 ? 'more' : 'fewer'} ${n === 1 ? 'visit' : 'visits'} than ${prev}.`
}

export function previousLabel(period: ReportPeriod): string {
  return PREVIOUS_LABEL[period]
}
