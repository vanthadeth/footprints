import { useEffect, useState } from 'react'
import { ClipboardList, ReceiptText } from 'lucide-react'
import { ordersService, type CustomerOrder } from '@/features/orders/ordersService'
import { supabase } from '@footprints/shared/lib/supabase'
import { displayName } from '@footprints/shared/lib/displayName'
import { useCustomerInvoices } from './useCustomerInvoices'
import { agoText, orderEntries, type OrderEntry } from './timeline'

const TONE = { ok: 'bg-status-working/10 text-status-working', warn: 'bg-status-warn/10 text-status-warn', muted: 'bg-neutral-100 text-neutral-500' }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'inv', label: 'Invoiced' },
  { key: 'so', label: 'Not invoiced' },
] as const

const monthOf = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'No date')
const dayOf = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—')

/** Who the sale orders and invoices belong to, by user id. */
function useSalespeople(ids: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const key = [...new Set(ids)].sort().join(',')
  useEffect(() => {
    if (!key) return
    let cancelled = false
    supabase
      .from('users')
      .select('id, full_name, nickname')
      .in('id', key.split(','))
      .then(({ data }) => {
        if (cancelled || !data) return
        setNames(Object.fromEntries(data.map((u) => [u.id, displayName(u.full_name ?? '', u.nickname)])))
      })
    return () => {
      cancelled = true
    }
  }, [key])
  return names
}

/**
 * Orders and invoices in one timeline. A sale order that has been invoiced shows under its
 * invoice as "Ref: Sale Order"; one that hasn't shows as itself.
 */
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
  const names = useSalespeople(all.map((e) => e.userId).filter((x): x is string => !!x))
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
            {g.items.map((e) => {
              const Icon = e.kind === 'inv' ? ReceiptText : ClipboardList
              const who = e.userId ? names[e.userId] : null
              return (
                <li key={e.key} className="border-t border-neutral-100 px-3.5 py-3 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-extrabold text-neutral-900">
                      {dayOf(e.date)} <span className="text-xs font-semibold text-neutral-500">· {agoText(e.date, today)}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-extrabold tabular-nums text-neutral-900">{e.amount}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${e.kind === 'inv' ? 'bg-brand-50 text-brand-600' : 'bg-neutral-100 text-neutral-600'}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">
                      <span className="font-bold text-neutral-900">{e.kind === 'inv' ? 'Invoice' : 'Sale Order'} {e.no}</span>
                      {who ? ` · ${who}` : ''}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[e.chip.tone]}`}>{e.chip.label}</span>
                  </div>
                  {e.ref && (
                    <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-dashed border-neutral-200 pt-2 text-xs text-neutral-500">
                      <span className="truncate">Ref: Sale Order {e.ref.no}</span>
                      <span className="shrink-0 tabular-nums">{e.ref.amount}</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
