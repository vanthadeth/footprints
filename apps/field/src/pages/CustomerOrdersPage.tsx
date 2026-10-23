import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ReceiptText, Store } from 'lucide-react'
import { customersService } from '@/features/customers/customersService'
import { PAGE, orderBadges, orderValue, ordersService, type CustomerOrder } from '@/features/orders/ordersService'
import { formatTime } from '@/lib/datetime'
import { DataTable, type Column } from '@footprints/shared/components/desktop/DataTable'
import { useIsWide } from '@/hooks/useIsDesktop'

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const stamp = (iso: string | null) => (iso ? `${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Phnom_Penh' })}, ${formatTime(iso)}` : null)
const TONE = {
  ok: 'bg-status-working/10 text-status-working',
  warn: 'bg-status-warn/10 text-status-warn',
  muted: 'bg-neutral-100 text-neutral-500',
}

/**
 * A customer's orders (Customer › Order history), latest first: when, the
 * order's reference, its value, whether it's still valid and who approved
 * it. Orders come from the sale order sheet; a page of 30 at a time.
 */
export function CustomerOrdersPage() {
  const wide = useIsWide()
  const { id } = useParams<{ id: string }>()
  const passed = (useLocation().state as { name?: string } | null) ?? null
  const [name, setName] = useState<string | null>(passed?.name ?? null)
  const [rows, setRows] = useState<CustomerOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    ordersService
      .forCustomer(id)
      .then((r) => {
        if (cancelled) return
        setRows(r.rows)
        setTotal(r.total)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    if (!name)
      customersService
        .get(id)
        .then((c) => !cancelled && setName(c?.shop_name ?? null))
        .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the name is only looked up once
  }, [id])

  const loadMore = async () => {
    if (!id) return
    setMore(true)
    try {
      const r = await ordersService.forCustomer(id, rows.length, PAGE)
      setRows((prev) => [...prev, ...r.rows])
      setTotal(r.total)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMore(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1.5 md:max-w-2xl md:px-8 lg:max-w-6xl lg:pt-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-brand-500 text-white">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-bold text-neutral-900">{name ?? 'Customer'}</span>
          <span className="block text-[13px] text-neutral-500">{loading ? 'Loading orders…' : `${total.toLocaleString('en-US')} ${total === 1 ? 'order' : 'orders'} · latest first`}</span>
        </span>
      </div>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-neutral-100 bg-white px-4 py-10 text-center shadow-card">
          <ReceiptText className="h-8 w-8 text-neutral-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-neutral-700">No orders yet</p>
          <p className="mt-0.5 text-[13px] text-neutral-500">Approved orders from the sale order sheet show up here.</p>
        </div>
      )}

      {wide ? (
        !loading && rows.length > 0 && <DataTable columns={ORDER_COLUMNS} rows={rows} rowKey={(o) => o.id} />
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}

      {!loading && rows.length < total && (
        <button type="button" onClick={loadMore} disabled={more} className="h-11 w-full rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900 disabled:opacity-50">
          {more ? 'Loading…' : `Show ${Math.min(PAGE, total - rows.length)} more`}
        </button>
      )}
    </div>
  )
}

/** The desktop table: one row per order, sortable within what's loaded. */
const ORDER_COLUMNS: Column<CustomerOrder>[] = [
  { key: 'date', header: 'Order date', cell: (o) => <span className="font-semibold">{day(o.order_date)}</span>, sortValue: (o) => o.order_date, className: 'whitespace-nowrap' },
  { key: 'no', header: 'Order', cell: (o) => <span className="font-mono text-[12px] text-neutral-500">{o.order_no}</span>, sortValue: (o) => o.order_no, className: 'whitespace-nowrap' },
  {
    key: 'value',
    header: 'Value',
    align: 'right',
    cell: (o) => <span className={`font-extrabold ${o.status === 'cancelled' ? 'text-neutral-500 line-through' : ''}`}>{orderValue(o)}</span>,
    sortValue: (o) => (o.is_khr ? o.total_khr : o.total_usd),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (o) => {
      const { status, approval } = orderBadges(o)
      return (
        <span className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${TONE[status.tone]}`}>{status.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${TONE[approval.tone]}`}>{approval.label}</span>
        </span>
      )
    },
  },
  {
    key: 'approved',
    header: 'Approved',
    cell: (o) => {
      const at = stamp(o.approved_at)
      return o.approved && (o.approved_by || at) ? <span className="text-[12.5px] text-neutral-600">{[o.approved_by ? `by ${o.approved_by}` : null, at].filter(Boolean).join(' · ')}</span> : <span className="text-neutral-400">—</span>
    },
  },
  {
    key: 'details',
    header: 'Details',
    cell: (o) => {
      const facts = [o.delivery_date ? `Delivery ${day(o.delivery_date)}` : null, o.payment_term, o.so_type, o.stock_checked ? 'Stock checked' : null, o.assign_to ? `Assigned: ${o.assign_to}` : null].filter(Boolean)
      return <span className="text-[12.5px] text-neutral-600">{facts.join(' · ') || '—'}</span>
    },
  },
]

function OrderCard({ order: o }: { order: CustomerOrder }) {
  const { status, approval } = orderBadges(o)
  const approvedAt = stamp(o.approved_at)
  const facts = [
    o.delivery_date ? `Delivery ${day(o.delivery_date)}` : null,
    o.payment_term,
    o.so_type,
    o.stock_checked ? 'Stock checked' : null,
    o.sheet_status != null && o.sheet_status !== 1 ? `Order status ${o.sheet_status}` : null,
  ].filter(Boolean)
  return (
    <li className={`rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card ${o.status === 'cancelled' ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-neutral-900">{day(o.order_date)}</span>
          <span className="block truncate font-mono text-[12px] text-neutral-500">{o.order_no}</span>
        </span>
        <span className={`shrink-0 text-[16px] font-extrabold tabular-nums ${o.status === 'cancelled' ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>{orderValue(o)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${TONE[status.tone]}`}>{status.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${TONE[approval.tone]}`}>{approval.label}</span>
        {o.approved && (o.approved_by || approvedAt) && (
          <span className="text-[12px] text-neutral-500">
            {o.approved_by ? `by ${o.approved_by}` : ''}
            {o.approved_by && approvedAt ? ' · ' : ''}
            {approvedAt ?? ''}
          </span>
        )}
      </div>
      {facts.length > 0 && <p className="mt-1.5 text-[12.5px] text-neutral-600">{facts.join(' · ')}</p>}
      {o.assign_to && <p className="mt-0.5 text-[12.5px] text-neutral-500">Assigned: {o.assign_to}</p>}
      {o.note && <p className="mt-1.5 line-clamp-3 whitespace-pre-line rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[12.5px] text-neutral-700 dark:bg-neutral-800">{o.note}</p>}
    </li>
  )
}
