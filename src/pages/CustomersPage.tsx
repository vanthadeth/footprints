import { useEffect, useMemo, useState } from 'react'
import { CUSTOMER_DUE_AFTER_DAYS } from '@/lib/config'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Construction, MapPin, Search, Store, Target } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useCustomers } from '@/features/customers/useCustomers'
import type { CustomerDirectoryRow } from '@/features/customers/customersService'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { locationService } from '@/features/location/locationService'
import { CUSTOMER_MANAGEMENT_ENABLED } from '@/lib/featureFlags'
import { distanceInMeters, formatDistance } from '@/lib/geo'
import { timeAgo } from '@/lib/datetime'

type Filter = 'all' | 'active' | 'nearby' | 'due'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'due', label: 'Due' },
]

/** A customer with no visit in this many days (or none at all) shows up under "Due" -- a stated assumption, not a configured business rule. */

/** The field-sales customer book: search, a few practical filters, and a fast path into a visit -- no sales/outstanding figures (see redesign plan), just what helps decide who to see next. */
export function CustomersPage() {
  if (!CUSTOMER_MANAGEMENT_ENABLED) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <Construction className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Customer management is temporarily unavailable.</p>
      </div>
    )
  }

  return <CustomersList />
}

function CustomersList() {
  const { customers, loading, error } = useCustomers()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null)
  const [positionError, setPositionError] = useState(false)
  const [presetCustomer, setPresetCustomer] = useState<PresetCustomer | null>(null)
  const [visitOpen, setVisitOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (filter !== 'nearby' || position) return
    locationService
      .getCurrentPosition()
      .then((reading) => setPosition({ latitude: reading.latitude, longitude: reading.longitude }))
      .catch(() => setPositionError(true))
  }, [filter, position])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = customers.filter((c) => {
      if (!q) return true
      return (c.shop_name?.toLowerCase().includes(q) ?? false) || (c.province_name?.toLowerCase().includes(q) ?? false)
    })

    if (filter === 'active') list = list.filter((c) => c.status === 'active')
    if (filter === 'due') {
      list = list.filter((c) => !c.last_visit_date || daysSince(c.last_visit_date) >= CUSTOMER_DUE_AFTER_DAYS)
    }
    if (filter === 'nearby' && position) {
      list = [...list].sort((a, b) => distanceOf(a, position) - distanceOf(b, position))
    }
    return list
  }, [customers, query, filter, position])

  function handleVisit(customer: CustomerDirectoryRow) {
    if (!customer.id) return
    setPresetCustomer({ id: customer.id, shopName: customer.shop_name ?? 'Customer' })
    setVisitOpen(true)
  }

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer…"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
        </div>

        <div className="mt-3 flex gap-1 rounded-full bg-neutral-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold tap-target ${
                filter === f.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Link to="/customers/coverage" className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-card">
          <Target className="h-5 w-5 shrink-0 text-status-warn" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-neutral-900">Coverage & tiers</span>
            <span className="block text-xs text-neutral-500">Who's due or overdue, by A / B / C tier</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>

        {filter === 'nearby' && positionError && (
          <p className="mt-2 text-xs text-status-warn">Couldn't get your location -- showing unsorted.</p>
        )}

        {error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="mt-4 space-y-2">
            <div className="h-20 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-20 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-20 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={Store} title="No customers found" body="Try a different search or filter." />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((c) => (
              <CustomerRow
                key={c.id}
                customer={c}
                distance={filter === 'nearby' && position ? distanceOf(c, position) : null}
                onOpen={() => navigate(`/customers/${c.id}`)}
                onVisit={() => handleVisit(c)}
              />
            ))}
          </div>
        )}
      </div>

      <VisitFlow
        open={visitOpen}
        onClose={() => {
          setVisitOpen(false)
          setPresetCustomer(null)
        }}
        presetCustomer={presetCustomer}
      />
    </div>
  )
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function distanceOf(c: CustomerDirectoryRow, position: { latitude: number; longitude: number }): number {
  if (c.latitude == null || c.longitude == null) return Infinity
  return distanceInMeters(position.latitude, position.longitude, c.latitude, c.longitude)
}

function CustomerRow({
  customer,
  distance,
  onOpen,
  onVisit,
}: {
  customer: CustomerDirectoryRow
  distance: number | null
  onOpen: () => void
  onVisit: () => void
}) {
  return (
    <div className="rounded-xl2 bg-white p-3.5 shadow-card">
      <button onClick={onOpen} className="flex w-full items-start gap-3 text-left tap-target">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <Store className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-neutral-900">{customer.shop_name}</span>
          {customer.province_name && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
              <MapPin className="h-3 w-3" /> {customer.province_name}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-neutral-400">
            {distance != null && Number.isFinite(distance) && `${formatDistance(distance)} away · `}
            Last visit: {customer.last_visit_date ? timeAgo(customer.last_visit_date) : 'Never'}
          </span>
        </span>
      </button>
      <button
        onClick={onVisit}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-xs font-semibold uppercase tracking-wide text-white tap-target"
      >
        Visit
      </button>
    </div>
  )
}
