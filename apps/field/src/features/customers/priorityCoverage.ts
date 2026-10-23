import { PRIORITY_PURCHASE_DAYS, PRIORITY_VISIT_DAYS } from '@/lib/config'

/**
 * Priority customers: the person's own customers who bought recently. They are the ones a visit
 * matters for, so the number to watch is how many were seen within the visit cycle.
 */
export interface PriorityCustomer {
  id: string
  shop_name: string
  owner_id: string | null
  status: string
  last_purchase_date: string | null
  last_visit_date: string | null
}

export interface PriorityVisit {
  customer_id: string | null
  checked_in_at: string
  cancelled_at?: string | null
}

export interface OverdueCustomer {
  id: string
  name: string
  /** Days since the last visit; null when never visited. */
  daysSince: number | null
}

export interface PriorityCoverage {
  total: number
  seen: number
  overdue: OverdueCustomer[]
}

const DAY_MS = 86_400_000
const dayStart = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime()

/** Cut-off date ("YYYY-MM-DD") for "bought recently", for the query. */
export function priorityPurchaseSince(now: number, days = PRIORITY_PURCHASE_DAYS): string {
  return new Date(now - days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Of the person's customers who bought within the purchase window, which have been visited within the
 * visit cycle. The last visit is the later of the customer's recorded last visit and the person's own visits.
 */
export function priorityCoverage(
  customers: PriorityCustomer[],
  visits: PriorityVisit[],
  now: number,
  purchaseDays = PRIORITY_PURCHASE_DAYS,
  visitDays = PRIORITY_VISIT_DAYS
): PriorityCoverage {
  const lastOwn = new Map<string, number>()
  for (const v of visits) {
    if (v.cancelled_at || !v.customer_id) continue
    const t = new Date(v.checked_in_at).getTime()
    if (t > (lastOwn.get(v.customer_id) ?? 0)) lastOwn.set(v.customer_id, t)
  }
  const bought = priorityPurchaseSince(now, purchaseDays)
  const priority = customers.filter((c) => c.status === 'active' && !!c.last_purchase_date && c.last_purchase_date >= bought)
  const overdue: OverdueCustomer[] = []
  let seen = 0
  for (const c of priority) {
    const recorded = c.last_visit_date ? dayStart(c.last_visit_date) : 0
    const last = Math.max(recorded, lastOwn.get(c.id) ?? 0)
    const daysSince = last > 0 ? Math.floor((now - last) / DAY_MS) : null
    if (daysSince != null && daysSince <= visitDays) seen += 1
    else overdue.push({ id: c.id, name: c.shop_name, daysSince })
  }
  // Longest unseen first; never visited at the top.
  overdue.sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity))
  return { total: priority.length, seen, overdue }
}
