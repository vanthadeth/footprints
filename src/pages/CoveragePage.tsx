import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Loader2, Plus, Search, Users } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { coverageService, type CoverageRow, type CoverageScope } from '@/features/customers/coverageService'
import { DUE_META, TIERS, lastVisitLabel, sortByUrgency, tierCadenceLabel } from '@/features/customers/coverage'
import { TierBadge } from '@/features/customers/TierBadge'
import { locationService } from '@/features/location/locationService'
import { planService } from '@/features/plan/planService'
import { todayDateString } from '@/lib/dateRange'
import { formatDistance } from '@/lib/geo'

type View = 'due' | 'nearby' | 'all'
type TierFilter = 'any' | 'A' | 'B' | 'C'

const VIEW_SCOPE: Record<View, CoverageScope> = { due: 'mine', nearby: 'nearby', all: 'all' }

/**
 * Customer coverage: who's overdue for a visit given their tier's cadence
 * (A weekly, B fortnightly, C monthly). "Due now" looks at your own
 * customers (ones you own or have visited); Nearby and All reach every
 * customer you can see. "+ Plan" drops a customer onto today's plan.
 */
export function CoveragePage() {
  const [view, setView] = useState<View>('due')
  const [tier, setTier] = useState<TierFilter>('any')
  const [query, setQuery] = useState('')
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plannedIds, setPlannedIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const today = todayDateString()

  useEffect(() => {
    locationService
      .getCurrentPosition()
      .then((r) => setHere({ lat: r.latitude, lng: r.longitude }))
      .catch(() => {
        // Without a fix there are no distances and Nearby explains why.
      })
    planService
      .list(today)
      .then((items) => setPlannedIds(new Set(items.map((i) => i.customer_id))))
      .catch(() => {
        // Only used to label "Planned" -- adding still works without it.
      })
  }, [today])

  useEffect(() => {
    if (view === 'nearby' && !here) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      coverageService
        .list({ scope: VIEW_SCOPE[view], lat: here?.lat, lng: here?.lng, search: query, limit: view === 'due' ? 500 : 200 })
        .then((r) => {
          if (cancelled) return
          setRows(r)
          setError(null)
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load customers.'))
        .finally(() => !cancelled && setLoading(false))
    }, query ? 250 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [view, here, query])

  const counts = useMemo(() => {
    const c = { overdue: 0, due: 0, ok: 0 }
    if (view === 'due') for (const r of rows) if (r.due_state in c) c[r.due_state as keyof typeof c]++
    return c
  }, [rows, view])

  const shown = useMemo(() => {
    let list = tier === 'any' ? rows : rows.filter((r) => r.tier === tier)
    if (view === 'due') list = sortByUrgency(list.filter((r) => r.due_state === 'overdue' || r.due_state === 'due'))
    return list
  }, [rows, tier, view])

  async function handlePlan(id: string) {
    setAdding(id)
    try {
      await planService.add(today, id, 'suggested')
      setPlannedIds((prev) => new Set(prev).add(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to the plan.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-3 md:max-w-2xl md:px-8">
      <SegmentedControl<View>
        ariaLabel="Customers to show"
        value={view}
        onChange={setView}
        options={[
          { value: 'due', label: 'Due now' },
          { value: 'nearby', label: 'Nearby' },
          { value: 'all', label: 'All' },
        ]}
      />

      {view === 'due' && !loading && (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Overdue" value={counts.overdue} tone="text-status-danger" />
          <Tile label="Due soon" value={counts.due} tone="text-status-warn" />
          <Tile label="On track" value={counts.ok} tone="text-status-working" />
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <label htmlFor="coverage-search" className="sr-only">
          Search customers
        </label>
        <input
          id="coverage-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shop name or code"
          className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
        />
      </div>

      <div role="group" aria-label="Tier" className="flex gap-2">
        {(['any', ...TIERS] as TierFilter[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tier === t}
            onClick={() => setTier(t)}
            className={`h-9 rounded-full border px-3.5 text-[13px] font-bold tap-target ${
              tier === t ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
            }`}
          >
            {t === 'any' ? 'All tiers' : `Tier ${t}`}
          </button>
        ))}
      </div>
      {tier !== 'any' && <p className="-mt-2 px-1 text-xs text-neutral-500">Tier {tier}: visit {tierCadenceLabel(tier).toLowerCase()}.</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-card">
          {view === 'nearby' && !here ? (
            <EmptyState icon={Users} title="Location needed" body="Allow location access to see the customers closest to you." />
          ) : view === 'due' && !query ? (
            <EmptyState icon={Check} title="Everyone's on track" body="None of your customers are due or overdue for a visit." />
          ) : (
            <EmptyState icon={Users} title="No customers found" />
          )}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
          {shown.map((r) => {
            const planned = plannedIds.has(r.customer_id)
            return (
              <li key={r.customer_id} className="flex items-center gap-3 px-3.5 py-3">
                <TierBadge tier={r.tier} />
                <Link to={`/customers/${r.customer_id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-neutral-900">{r.shop_name}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DUE_META[r.due_state].dot}`} aria-hidden />
                    <span className={DUE_META[r.due_state].text}>{lastVisitLabel(r)}</span>
                    {r.distance_m != null && <span className="text-neutral-500">· {formatDistance(r.distance_m)}</span>}
                  </p>
                </Link>
                {planned ? (
                  <span className="flex h-9 items-center gap-1 px-2 text-xs font-bold text-status-working">
                    <Check className="h-3.5 w-3.5" /> Planned
                  </span>
                ) : (
                  <button
                    onClick={() => handlePlan(r.customer_id)}
                    disabled={adding !== null}
                    aria-label={`Add ${r.shop_name} to today's plan`}
                    className="flex h-9 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-600 tap-target disabled:opacity-60"
                  >
                    {adding === r.customer_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Plan
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {plannedIds.size > 0 && (
        <Link to="/plan" className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-card">
          <span className="text-sm font-semibold text-neutral-900">Today's plan · {plannedIds.size} stops</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>
      )}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-card">
      <p className={`text-2xl font-extrabold leading-none ${tone}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-neutral-500">{label}</p>
    </div>
  )
}
