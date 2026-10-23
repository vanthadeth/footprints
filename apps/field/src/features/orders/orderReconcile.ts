import { ORDER_RECONCILE_DAYS } from '@footprints/shared/lib/config'
import { localDateKey } from '@/lib/dateRange'

/**
 * A visit can be "ordered" in two ways: the person marks it (the Ordered status,
 * or an order amount), or the sale order sheet sync brings in an order for that
 * customer. The mark counts only provisionally, and is reconciled against the
 * synced orders from the end of the visit's day up to ORDER_RECONCILE_DAYS days
 * after it:
 *
 * - confirmed: marked, and a synced order for the customer falls in the window.
 * - synced:    not marked, but a synced order for the customer falls in the window.
 * - pending:   marked, no order yet, and the window is still open.
 * - unmatched: marked, no order, and the window has closed -- it stops counting.
 * - none:      neither.
 */
export type OrderState = 'confirmed' | 'synced' | 'pending' | 'unmatched' | 'none'

/** The synced order that matches a visit (public.visit_orders). */
export interface OrderMatch {
  orderNo: string
  orderDate: string
  totalUsd: number | null
}

interface VisitLike {
  checked_in_at: string
  order_status_id?: string | null
  order_amount_usd?: number | null
}

/** Did the person mark this visit as ordered? `orderedOptionId` is the id of the "Ordered" order status. */
export function isMarkedOrdered(v: VisitLike, orderedOptionId: string | null): boolean {
  return (!!orderedOptionId && v.order_status_id === orderedOptionId) || (v.order_amount_usd ?? 0) > 0
}

const DAY_MS = 86_400_000

/** When the visit's reconcile window closes: the end of the local day `days` days after the visit's day. */
export function reconcileEndMs(checkedInAt: string, days: number = ORDER_RECONCILE_DAYS): number {
  const start = new Date(`${localDateKey(checkedInAt)}T00:00:00+07:00`).getTime()
  return start + (days + 1) * DAY_MS
}

export function orderState(visit: VisitLike, marked: boolean, match: OrderMatch | null | undefined, now: number, days: number = ORDER_RECONCILE_DAYS): OrderState {
  if (match) return marked ? 'confirmed' : 'synced'
  if (!marked) return 'none'
  return now < reconcileEndMs(visit.checked_in_at, days) ? 'pending' : 'unmatched'
}

/** Does this state count as an order today? Pending counts (temporarily); unmatched no longer does. */
export function countsAsOrdered(state: OrderState | undefined): boolean {
  return state === 'confirmed' || state === 'synced' || state === 'pending'
}
