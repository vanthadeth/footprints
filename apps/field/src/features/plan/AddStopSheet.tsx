import { useEffect, useState } from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { coverageService, type CoverageRow } from '@/features/customers/coverageService'
import { DUE_META, lastVisitLabel } from '@/features/customers/coverage'
import { formatDistance } from '@/lib/geo'
import { TierBadge } from '@/features/customers/TierBadge'

/**
 * Pick a customer to add to the plan: nearest first until you type, then a
 * name/code search across every customer you can see.
 */
export function AddStopSheet({
  open,
  onClose,
  here,
  plannedIds,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  here: { lat: number; lng: number } | null
  plannedIds: Set<string>
  onAdd: (customerId: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      const search = query.trim()
      coverageService
        .list({ scope: search || !here ? 'all' : 'nearby', lat: here?.lat, lng: here?.lng, search, limit: 30 })
        .then((r) => !cancelled && setRows(r))
        .catch(() => !cancelled && setRows([]))
        .finally(() => !cancelled && setLoading(false))
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, here])

  async function handleAdd(id: string) {
    setAdding(id)
    await onAdd(id)
    setAdding(null)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a stop">
      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <label htmlFor="add-stop-search" className="sr-only">
            Search customers
          </label>
          <input
            id="add-stop-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shop name or code"
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
        </div>
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {query.trim() ? 'Results' : here ? 'Nearest to you' : 'Customers'}
        </p>
        <div className="max-h-[50vh] divide-y divide-neutral-100 overflow-y-auto rounded-xl2 border border-neutral-200 bg-white dark:divide-neutral-800">
          {loading && rows.length === 0 && (
            <p className="flex items-center justify-center gap-2 p-4 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {!loading && rows.length === 0 && <p className="p-4 text-center text-sm text-neutral-500">No customers found.</p>}
          {rows.map((r) => {
            const planned = plannedIds.has(r.customer_id)
            return (
              <div key={r.customer_id} className="flex items-center gap-3 px-3 py-2.5">
                <TierBadge tier={r.tier} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{r.shop_name}</p>
                  <p className={`truncate text-xs ${DUE_META[r.due_state].text}`}>
                    {lastVisitLabel(r)}
                    {r.distance_m != null && <span className="text-neutral-500"> · {formatDistance(r.distance_m)}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(r.customer_id)}
                  disabled={planned || adding !== null}
                  aria-label={planned ? `${r.shop_name} is already planned` : `Add ${r.shop_name}`}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-brand-500 px-3 text-xs font-bold text-white tap-target disabled:bg-neutral-100 disabled:text-neutral-400"
                >
                  {adding === r.customer_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : planned ? null : <Plus className="h-3.5 w-3.5" />}
                  {planned ? 'Planned' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
