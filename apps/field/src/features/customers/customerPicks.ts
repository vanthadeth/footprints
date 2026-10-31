import type { BookRow } from './customerBookService'

export type QuickPick = 'near' | 'overdue' | 'due' | 'never' | 'plan'

/** Not seen for more than 45 days, or never: the "overdue" the Customers page leads with. */
export const isOverdue = (r: Pick<BookRow, 'days_since'>) => r.days_since == null || r.days_since > 45

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The customers a quick chip narrows to. `near` does not filter (it only sorts by distance). */
export function applyPick(rows: BookRow[], pick: QuickPick | null, today: string, planned: Set<string>): BookRow[] {
  switch (pick) {
    case 'overdue':
      return rows.filter(isOverdue)
    case 'never':
      return rows.filter((r) => r.days_since == null)
    case 'due': {
      const horizon = addDays(today, 7)
      return rows.filter((r) => !!r.next_visit && r.next_visit.slice(0, 10) <= horizon)
    }
    case 'plan':
      return rows.filter((r) => planned.has(r.customer_id))
    default:
      return rows
  }
}

/** Case-insensitive match on the shop name, code, district or province. */
export function matchesQuery(r: BookRow, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [r.shop_name, r.code, r.district, r.province_name].some((v) => !!v && v.toLowerCase().includes(s))
}

export interface CoverageBucket {
  key: 'b7' | 'b15' | 'b30' | 'b45' | 'b45p'
  count: number
}

/** How long ago the customers were last visited, in the five bands the coverage sheet shows. */
export function coverage(rows: BookRow[]): { buckets: CoverageBucket[]; within45: number } {
  const n = { b7: 0, b15: 0, b30: 0, b45: 0, b45p: 0 }
  for (const r of rows) {
    const d = r.days_since
    if (d == null || d > 45) n.b45p++
    else if (d <= 7) n.b7++
    else if (d <= 15) n.b15++
    else if (d <= 30) n.b30++
    else n.b45++
  }
  return {
    buckets: (['b7', 'b15', 'b30', 'b45', 'b45p'] as const).map((key) => ({ key, count: n[key] })),
    within45: rows.length - n.b45p,
  }
}

/**
 * Who to visit next: the nearest overdue customer when we know where the person is
 * (`byDistance` is the same book sorted by distance), else the one longest unseen.
 */
export function visitNext(rows: BookRow[], byDistance: BookRow[] | null): BookRow | null {
  const pool = byDistance && byDistance.length ? byDistance : [...rows].sort((a, b) => (b.days_since ?? 1e9) - (a.days_since ?? 1e9))
  return pool.find(isOverdue) ?? null
}
