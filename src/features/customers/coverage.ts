import type { CoverageRow, DueState, Tier } from './coverageService'

export const TIERS: Tier[] = ['A', 'B', 'C']

/** How often each tier should be seen -- mirrors app.tier_cadence_days (0087). */
export const TIER_CADENCE_DAYS: Record<Tier, number> = { A: 7, B: 14, C: 30 }

export function tierCadenceLabel(tier: string): string {
  const days = TIER_CADENCE_DAYS[tier as Tier] ?? TIER_CADENCE_DAYS.B
  return days === 7 ? 'Weekly' : days === 14 ? 'Every 2 weeks' : 'Monthly'
}

/** Tailwind classes for the small A/B/C tier badge. */
export const TIER_BADGE: Record<Tier, string> = {
  A: 'bg-brand-500 text-white',
  B: 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300',
  C: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
}

export const DUE_META: Record<DueState, { label: string; dot: string; text: string }> = {
  overdue: { label: 'Overdue', dot: 'bg-status-danger', text: 'text-status-danger' },
  due: { label: 'Due', dot: 'bg-status-warn', text: 'text-status-warn' },
  never: { label: 'Never visited', dot: 'bg-neutral-400', text: 'text-neutral-500' },
  ok: { label: 'On track', dot: 'bg-status-working', text: 'text-status-working' },
}

const DUE_RANK: Record<DueState, number> = { overdue: 0, due: 1, never: 2, ok: 3 }

/** Most urgent first: overdue (longest overdue first), then due, never visited, on track; nearer first within a tie. */
export function sortByUrgency(rows: CoverageRow[]): CoverageRow[] {
  return [...rows].sort((a, b) => {
    const rank = DUE_RANK[a.due_state] - DUE_RANK[b.due_state]
    if (rank !== 0) return rank
    const overdueA = (a.days_since ?? 0) - a.cadence_days
    const overdueB = (b.days_since ?? 0) - b.cadence_days
    if (overdueA !== overdueB) return overdueB - overdueA
    return (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity)
  })
}

/** "Visited today" / "Yesterday" / "12 days ago" / "3 days overdue" / "Never visited". */
export function lastVisitLabel(row: Pick<CoverageRow, 'days_since' | 'cadence_days' | 'due_state'>): string {
  if (row.days_since == null) return 'Never visited'
  if (row.due_state === 'overdue') {
    const over = row.days_since - row.cadence_days
    return `${over} day${over === 1 ? '' : 's'} overdue`
  }
  if (row.days_since === 0) return 'Visited today'
  if (row.days_since === 1) return 'Visited yesterday'
  return `Visited ${row.days_since} days ago`
}

/** Days between an ISO timestamp's date and `today` ("YYYY-MM-DD", both in the app timezone via the caller), null if never. */
export function daysAgo(iso: string | null, today: string, timeZone: string): number | null {
  if (!iso) return null
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const [y1, m1, d1] = day.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}
