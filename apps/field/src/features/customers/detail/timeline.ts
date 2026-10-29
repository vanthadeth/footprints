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
  due_date: string | null
}

export interface OrderEntry {
  key: string
  kind: 'so' | 'inv'
  date: string | null
  ref: string
  amount: string
  chip: { label: string; tone: 'ok' | 'warn' | 'muted' }
  sub: string
}

const invValue = (i: InvoiceRow) => (i.inv_value == null ? '—' : i.is_khr ? `៛${Math.round(i.inv_value).toLocaleString('en-US')}` : `$${i.inv_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

/** Sale orders and invoices as one list, newest first. */
export function orderEntries(orders: CustomerOrder[], invoices: InvoiceRow[]): OrderEntry[] {
  const so: OrderEntry[] = orders.map((o) => ({
    key: `so-${o.id}`,
    kind: 'so',
    date: o.order_date,
    ref: o.order_no,
    amount: orderValue(o),
    chip: o.status === 'cancelled' ? { label: 'Cancelled', tone: 'muted' } : o.approved ? { label: 'Approved', tone: 'ok' } : { label: 'Not approved', tone: 'warn' },
    sub: 'Sale order',
  }))
  const inv: OrderEntry[] = invoices.map((i) => ({
    key: `inv-${i.id}`,
    kind: 'inv',
    date: i.inv_date,
    ref: i.inv_no ?? '—',
    amount: invValue(i),
    chip: i.status === 9 ? { label: 'Void', tone: 'muted' } : i.status === 0 ? { label: 'Draft', tone: 'warn' } : { label: 'Submitted', tone: 'ok' },
    sub: `Invoice${i.received_date ? ' · Received' : i.sent_date ? ' · Sent' : ''}`,
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
