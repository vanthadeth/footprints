import type { TripRow } from './tripService'

export type HistoryFilter = 'all' | 'done' | 'rejected' | 'cancelled'
export const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
]

/** Still ahead of you: not over yet and not closed. */
export const isUpcoming = (t: TripRow, today: string) => t.end_date >= today && ['pending', 'changes', 'approved'].includes(t.status)

/** Upcoming (soonest first) and history (latest first). A trip you're on today stays in Upcoming. */
export function splitTrips(trips: TripRow[], today: string): { upcoming: TripRow[]; history: TripRow[] } {
  const upcoming = trips.filter((t) => isUpcoming(t, today)).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const history = trips.filter((t) => !isUpcoming(t, today)).sort((a, b) => b.start_date.localeCompare(a.start_date))
  return { upcoming, history }
}

/** What a history row is called: a past approved trip is Done; anything never decided before it ended counts as cancelled. */
export function historyKind(t: TripRow): Exclude<HistoryFilter, 'all'> {
  if (t.status === 'approved') return 'done'
  if (t.status === 'rejected') return 'rejected'
  return 'cancelled'
}

/** Years that have history, newest first; always includes the current one. */
export function historyYears(history: TripRow[], today: string): string[] {
  return [...new Set([today.slice(0, 4), ...history.map((t) => t.start_date.slice(0, 4))])].sort((a, b) => b.localeCompare(a))
}

export interface MonthGroup {
  key: string
  label: string
  trips: TripRow[]
}

/** History for one year and filter, grouped by the month each trip starts in (latest month first). */
export function monthGroups(history: TripRow[], year: string, filter: HistoryFilter): MonthGroup[] {
  const groups = new Map<string, TripRow[]>()
  for (const t of history) {
    if (!t.start_date.startsWith(year)) continue
    if (filter !== 'all' && historyKind(t) !== filter) continue
    const key = t.start_date.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, trips]) => ({ key, label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }), trips }))
}

/** The requester's approved trips this year, for the approver's context. */
export function yearSummary(trips: TripRow[], userId: string, year: string): { trips: number; days: number; total: number } {
  const mine = trips.filter((t) => t.user_id === userId && t.status === 'approved' && t.start_date.startsWith(year))
  return { trips: mine.length, days: mine.reduce((n, t) => n + t.days.length, 0), total: mine.reduce((n, t) => n + t.est_total, 0) }
}

/** Checks the approver sees: notice given, special allowance within the limit, and long days. */
export function approverChecks(trip: TripRow, opts: { noticeHours: number; specialCap: number; longKm?: number }): { ok: boolean; title: string; sub: string }[] {
  const longKm = opts.longKm ?? 250
  const notice = opts.noticeHours > 0 ? opts.noticeHours : 24
  const hours = (new Date(`${trip.start_date}T08:00:00Z`).getTime() - new Date(trip.created_at).getTime()) / 3_600_000
  const daysAhead = Math.max(Math.floor(hours / 24), 0)
  const out = [
    hours >= notice
      ? { ok: true, title: `Sent ${daysAhead} ${daysAhead === 1 ? 'day' : 'days'} before leaving`, sub: `Needs at least ${notice} hours` }
      : { ok: false, title: 'Sent late', sub: `Less than ${notice} hours before leaving` },
    trip.special_total > opts.specialCap
      ? { ok: false, title: 'Special allowance is over the limit', sub: `$${trip.special_total} of the $${opts.specialCap} limit` }
      : { ok: true, title: 'Special allowance is within the limit', sub: `$${trip.special_total} of the $${opts.specialCap} limit` },
  ]
  for (const d of trip.days) {
    if (d.km > longKm) out.push({ ok: false, title: `Long day on day ${d.day_no}`, sub: `About ${d.km} km, the longest drive of the trip` })
  }
  return out
}
