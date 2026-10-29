import { supabase } from '@footprints/shared/lib/supabase'

/** One sale order as the customer's order history shows it (synced from the SO tab of the sale order sheet). */
export interface CustomerOrder {
  id: string
  order_no: string
  status: 'new' | 'cancelled'
  order_date: string | null
  delivery_date: string | null
  total_usd: number | null
  total_khr: number | null
  is_khr: boolean
  sheet_status: number | null
  approved: boolean
  approved_by: string | null
  approved_at: string | null
  stock_checked: boolean
  payment_term: string | null
  so_type: string | null
  note: string | null
  assign_to: string | null
  user_id: string | null
  sheet_created_at: string | null
}

const COLUMNS =
  'id, order_no, status, order_date, delivery_date, total_usd, total_khr, is_khr, sheet_status, approved, approved_by, approved_at, stock_checked, payment_term, so_type, note, assign_to, user_id, sheet_created_at'

export const PAGE = 30

export const ordersService = {
  /** A page of the customer's orders, latest first (order date, then when the order was entered). */
  async forCustomer(customerId: string, from = 0, size = PAGE): Promise<{ rows: CustomerOrder[]; total: number }> {
    const { data, error, count } = await supabase
      .from('sale_orders')
      .select(COLUMNS, { count: 'exact' })
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('sheet_created_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, from + size - 1)
    if (error) throw new Error(error.details || error.message)
    return { rows: (data ?? []) as unknown as CustomerOrder[], total: count ?? 0 }
  },

  /** How many orders the customer has and when the latest was, for the Order history link. */
  async summary(customerId: string): Promise<{ total: number; latest: string | null }> {
    const { rows, total } = await this.forCustomer(customerId, 0, 1)
    return { total, latest: rows[0]?.order_date ?? null }
  },
}

/** What an order's status and approval read as, with their badge tones. */
export function orderBadges(o: Pick<CustomerOrder, 'status' | 'approved' | 'sheet_status'>): { status: { label: string; tone: 'ok' | 'muted' }; approval: { label: string; tone: 'ok' | 'warn' } } {
  return {
    status: o.status === 'cancelled' ? { label: 'Cancelled', tone: 'muted' } : { label: 'Valid', tone: 'ok' },
    approval: o.approved ? { label: 'Approved', tone: 'ok' } : { label: 'Not approved', tone: 'warn' },
  }
}

/** "$1,385.32" or "៛120,000" -- the order's value in its own currency; "—" without one. */
export function orderValue(o: Pick<CustomerOrder, 'is_khr' | 'total_usd' | 'total_khr'>): string {
  if (o.is_khr) return o.total_khr != null ? `៛${Math.round(o.total_khr).toLocaleString('en-US')}` : '—'
  return o.total_usd != null ? `$${o.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
}
