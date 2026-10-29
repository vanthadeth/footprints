import { useEffect, useState } from 'react'
import { ordersService, type CustomerOrder } from '@/features/orders/ordersService'
import { useCustomerInvoices } from './useCustomerInvoices'
import { agoText, orderEntries, type OrderEntry } from './timeline'

const TONE = { ok: 'bg-status-working/10 text-status-working', warn: 'bg-status-warn/10 text-status-warn', muted: 'bg-neutral-100 text-neutral-500' }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'so', label: 'Sale orders' },
  { key: 'inv', label: 'Invoices' },
] as const

const monthOf = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'No date')
const dayOf = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')

/** Sale orders and invoices in one timeline (canvas Customer · orders): days ago first, the date second. */
export function OrdersTab({ customerId, today }: { customerId: string; today: string }) {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const invoices = useCustomerInvoices(customerId)

  useEffect(() => {
    let cancelled = false
    setOrdersLoading(true)
    ordersService
      .forCustomer(customerId, 0, 100)
      .then((r) => !cancelled && setOrders(r.rows))
      .catch(() => {})
      .finally(() => !cancelled && setOrdersLoading(false))
    return () => {
      cancelled = true
    }
  }, [customerId])

  const all = orderEntries(orders, invoices.rows)
  const shown = filter === 'all' ? all : all.filter((e) => e.kind === filter)
  const groups: { month: string; items: OrderEntry[] }[] = []
  for (const e of shown) {
    const m = monthOf(e.date)
    if (groups[groups.length - 1]?.month === m) groups[groups.length - 1].items.push(e)
    else groups.push({ month: m, items: [e] })
  }
  const loading = ordersLoading || invoices.loading

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Filter" className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`h-8 rounded-full border px-3 text-xs font-bold ${filter === f.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading && <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />}
      {!loading && shown.length === 0 && <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm text-neutral-500 shadow-card">No orders or invoices yet.</p>}
      {groups.map((g) => (
        <section key={g.month} aria-label={g.month}>
          <p className="px-0.5 pb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{g.month}</p>
          <ul className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            {g.items.map((e) => (
              <li key={e.key} className="flex items-start gap-3 border-t border-neutral-100 px-3.5 py-3 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold text-neutral-900">{agoText(e.date, today)}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {e.sub} · {e.ref}
                  </span>
                  <span className="block text-xs text-neutral-500">{dayOf(e.date)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-extrabold tabular-nums text-neutral-900">{e.amount}</span>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[e.chip.tone]}`}>{e.chip.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
