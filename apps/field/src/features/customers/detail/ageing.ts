export interface InvoiceLite {
  inv_no: string | null
  inv_date: string | null
  due_date: string | null
  inv_value: number | null
  status: number | null
}

export type AgeBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'
export const AGE_BUCKETS: { key: AgeBucket; label: string }[] = [
  { key: 'current', label: 'Not due' },
  { key: 'd1_30', label: '1–30' },
  { key: 'd31_60', label: '31–60' },
  { key: 'd61_90', label: '61–90' },
  { key: 'd90', label: '90+' },
]

export interface OpenInvoice {
  inv_no: string | null
  inv_date: string | null
  due_date: string | null
  /** The part of the invoice still owed. */
  open: number
  /** Days past the due date; negative while not yet due. */
  daysPastDue: number
  bucket: AgeBucket
}

const DAY = 86_400_000
const dayNo = (d: string) => Math.floor(new Date(d.slice(0, 10) + 'T00:00:00Z').getTime() / DAY)

export function bucketOf(daysPastDue: number): AgeBucket {
  if (daysPastDue <= 0) return 'current'
  if (daysPastDue <= 30) return 'd1_30'
  if (daysPastDue <= 60) return 'd31_60'
  if (daysPastDue <= 90) return 'd61_90'
  return 'd90'
}

/**
 * Which invoices the customer's balance is made of. Payments aren't synced, so this reads
 * the synced balance and assigns it to the newest submitted invoices first (what is still
 * owed is normally the latest billing); the last one is partly open when the balance runs out.
 * `today` is "YYYY-MM-DD".
 */
export function ageing(invoices: InvoiceLite[], balance: number | null | undefined, today: string): { open: OpenInvoice[]; totals: Record<AgeBucket, number>; total: number } {
  const totals: Record<AgeBucket, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 }
  const open: OpenInvoice[] = []
  let left = balance && balance > 0 ? balance : 0
  const submitted = invoices.filter((i) => i.status === 5 && (i.inv_value ?? 0) > 0 && (i.inv_date || i.due_date)).sort((a, b) => (b.inv_date ?? '').localeCompare(a.inv_date ?? ''))
  for (const inv of submitted) {
    if (left <= 0.005) break
    const take = Math.min(inv.inv_value as number, left)
    left -= take
    const due = inv.due_date ?? (inv.inv_date as string)
    const daysPastDue = dayNo(today) - dayNo(due)
    const bucket = bucketOf(daysPastDue)
    totals[bucket] += take
    open.push({ inv_no: inv.inv_no, inv_date: inv.inv_date, due_date: inv.due_date, open: take, daysPastDue, bucket })
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0)
  return { open, totals, total }
}
