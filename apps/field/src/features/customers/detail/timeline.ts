import type { CustomerOrder } from '@/features/orders/ordersService'
import { orderValue } from '@/features/orders/ordersService'

export interface InvoiceRow {
  id: string
  inv_no: string | null
  inv_date: string | null
  inv_value: number | null
  is_khr: boolean | null
  status: number | null
  sent_date: string | null
  received_date: string | null
  so_sheet_id: string | null
  sale_order_id: string | null
  user_id: string | null
  due_date: string | null
}

export interface OrderEntry {
  key: string
  /** A sale order nobody has invoiced yet, or an invoice (which carries its sale order as `ref`). */
  kind: 'so' | 'inv'
  date: string | null
  amount: string
  /** The number shown next to the icon: the sale order's or the invoice's. */
  no: string
  userId: string | null
  chip: { label: string; tone: 'ok' | 'warn' | 'muted' }
  /** For an invoice: the sale order it was issued from. */
  ref: { no: string; amount: string } | null
}

const invValue = (i: InvoiceRow) => (i.inv_value == null ? '—' : i.is_khr ? `៛${Math.round(i.inv_value).toLocaleString('en-US')}` : `$${i.inv_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

/**
 * Orders and invoices as one list, newest first. A sale order that has an invoice isn't a row of its
 * own: it shows under that invoice as "Ref: Sale Order". An invoice whose sale order isn't loaded (or
 * has none) is just the invoice.
 */
export function orderEntries(orders: CustomerOrder[], invoices: InvoiceRow[]): OrderEntry[] {
  const byId = new Map(orders.map((o) => [o.id, o]))
  const invoiced = new Set(invoices.map((i) => i.sale_order_id).filter((x): x is string => !!x))
  const inv: OrderEntry[] = invoices.map((i) => {
    const so = i.sale_order_id ? byId.get(i.sale_order_id) : undefined
    return {
      key: `inv-${i.id}`,
      kind: 'inv',
      date: i.inv_date,
      amount: invValue(i),
      no: i.inv_no ?? '—',
      userId: i.user_id ?? so?.user_id ?? null,
      chip: i.status === 9 ? { label: 'Void', tone: 'muted' } : i.status === 0 ? { label: 'Draft', tone: 'warn' } : i.received_date ? { label: 'Received', tone: 'ok' } : i.sent_date ? { label: 'Sent', tone: 'ok' } : { label: 'Submitted', tone: 'ok' },
      ref: so ? { no: so.order_no, amount: orderValue(so) } : null,
    }
  })
  const so: OrderEntry[] = orders
    .filter((o) => !invoiced.has(o.id))
    .map((o) => ({
      key: `so-${o.id}`,
      kind: 'so',
      date: o.order_date,
      amount: orderValue(o),
      no: o.order_no,
      userId: o.user_id,
      chip: o.status === 'cancelled' ? { label: 'Cancelled', tone: 'muted' } : o.approved ? { label: 'Approved', tone: 'ok' } : { label: 'Not approved', tone: 'warn' },
      ref: null,
    }))
  return [...so, ...inv].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** "4 days ago", "today", "3 weeks ago", "2 months ago" for a "YYYY-MM-DD" (or ISO) date against today's. */
export function agoText(date: string | null, today: string): string {
  if (!date) return '—'
  const d = Math.floor((new Date(today.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(date.slice(0, 10) + 'T00:00:00Z').getTime()) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  if (d < 60) return `${Math.round(d / 7)} weeks ago`
  return `${Math.round(d / 30)} months ago`
}
