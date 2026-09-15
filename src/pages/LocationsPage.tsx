import { useMemo, useState } from 'react'
import { Building2, Plus, Search, ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useProfile } from '@/features/auth/useProfile'
import { LocationFormSheet } from '@/features/locations/LocationFormSheet'
import { useLocations } from '@/features/locations/useLocations'
import type { WorkLocationRow } from '@/features/locations/locationsService'

/**
 * Super-admin screen: manage named clock-in/out sites (office, warehouses)
 * -- same shell as UsersPage. Self-guards on is_super_admin exactly like
 * SettingsPage/NotificationsPage, since this route is reachable by URL
 * regardless of nav visibility.
 */
export function LocationsPage() {
  const { profile, loading: profileLoading } = useProfile()

  if (profileLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-2 p-4 md:max-w-2xl">
        <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
        <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
      </div>
    )
  }

  if (!profile?.is_super_admin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <ShieldAlert className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Only a super admin can manage locations.</p>
      </div>
    )
  }

  return <LocationsList />
}

function LocationsList() {
  const { locations, loading, error, refresh } = useLocations()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editing, setEditing] = useState<WorkLocationRow | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return locations
    return locations.filter((l) => l.name.toLowerCase().includes(q))
  }, [locations, query])

  function openCreate() {
    setFormMode('create')
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(location: WorkLocationRow) {
    setFormMode('edit')
    setEditing(location)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search locations…"
              className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white tap-target"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="mt-4 space-y-2">
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Building2}
              title="No locations found"
              body="Try a different search, or create a new location (office, warehouse, etc.)."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((l) => (
              <LocationRow key={l.id} location={l} onClick={() => openEdit(l)} />
            ))}
          </div>
        )}
      </div>

      <LocationFormSheet open={formOpen} mode={formMode} location={editing} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </div>
  )
}

function LocationRow({ location, onClick }: { location: WorkLocationRow; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl2 bg-white p-3.5 text-left shadow-card tap-target">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <Building2 className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">{location.name}</p>
        <p className="truncate text-xs text-neutral-500">{location.radius_m}m radius</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          location.active ? 'bg-status-working/10 text-status-working' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {location.active ? 'Active' : 'Inactive'}
      </span>
    </button>
  )
}
