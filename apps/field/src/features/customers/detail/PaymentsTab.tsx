import { AGE_BUCKETS, ageing } from './ageing'
import { useCustomerInvoices } from './useCustomerInvoices'

const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dayOf = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—')

/** What the customer owes and how overdue it is (canvas Customer · payments). Payment history needs synced payments, which don't exist yet. */
export function PaymentsTab({ customerId, balance, today }: { customerId: string; balance: number | null; today: string }) {
  const { rows, loading } = useCustomerInvoices(customerId)
  const a = ageing(rows, balance, today)
  const owed = balance && balance > 0 ? balance : 0
  if (loading) return <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-card" aria-label="Outstanding">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-[22px] font-extrabold leading-7 ${owed > 0 ? 'text-neutral-900' : 'text-status-working'}`}>{owed > 0 ? `${usd(owed)} outstanding` : 'Nothing owed'}</p>
          {a.open.length > 0 && <p className="text-xs text-neutral-500">{a.open.length} {a.open.length === 1 ? 'invoice' : 'invoices'}</p>}
        </div>
        {owed > 0 && (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
              {AGE_BUCKETS.map((b, i) => (a.totals[b.key] > 0 ? <span key={b.key} className={['bg-status-working', 'bg-status-warn/70', 'bg-status-warn', 'bg-status-danger/80', 'bg-status-danger'][i]} style={{ width: `${(a.totals[b.key] / (a.total || 1)) * 100}%` }} /> : null))}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1 text-center">
              {AGE_BUCKETS.map((b) => (
                <div key={b.key}>
                  <p className="text-[13px] font-extrabold tabular-nums text-neutral-900">{usd(a.totals[b.key]).replace('.00', '')}</p>
                  <p className="text-[10.5px] text-neutral-500">{b.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">Days past due, counted from each invoice’s due date (invoice date plus payment term). Worked out from the synced balance; payments aren’t synced yet.</p>
          </>
        )}
      </section>

      {a.open.length > 0 && (
        <section aria-label="Open invoices">
          <p className="px-0.5 pb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Open invoices</p>
          <ul className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            {a.open.map((o) => (
              <li key={`${o.inv_no}-${o.inv_date}`} className="flex items-start gap-3 border-t border-neutral-100 px-3.5 py-3 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold text-neutral-900">{o.inv_no ?? '—'}</span>
                  <span className="block text-xs text-neutral-500">
                    Issued {dayOf(o.inv_date)}
                    {o.due_date ? ` · due ${dayOf(o.due_date)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-extrabold tabular-nums text-neutral-900">{usd(o.open)}</span>
                  <span className={`text-xs font-bold ${o.daysPastDue > 0 ? 'text-status-danger' : 'text-neutral-500'}`}>
                    {o.daysPastDue > 0 ? `${o.daysPastDue} days past due` : o.daysPastDue === 0 ? 'Due today' : `Due in ${-o.daysPastDue} days`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
