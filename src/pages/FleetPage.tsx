import { useMemo, useState } from 'react'
import { Truck } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useFleet } from '@/features/fleet/useFleet'
import { FleetListView } from '@/features/fleet/FleetListView'
import { FleetMapView } from '@/features/fleet/FleetMapView'
import { Freshness } from '@/features/fleet/Freshness'
import { DashboardTab } from '@/features/dashboard/DashboardTab'
import { ReportsTab } from '@/features/reports/ReportsTab'

type Tab = 'list' | 'map' | 'dashboard' | 'reports'

const TABS: { key: Tab; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'map', label: 'Map' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'reports', label: 'Reports' },
]

/** Supervisor/management view: live team status (list + map), KPI dashboard, and reports (spec §33-40). */
export function FleetPage() {
  const { snapshots: allSnapshots, loading, error, lastUpdatedAt } = useFleet()
  const [tab, setTab] = useState<Tab>('list')

  // "My fleet" means the field salespeople actually being tracked -- not
  // every active user who happens to report up to this viewer (HR/back
  // office reports, for instance, never clock in and would just be noise
  // here).
  const snapshots = useMemo(() => allSnapshots.filter((s) => s.member.isFieldSales), [allSnapshots])

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-5xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-neutral-500">Team status and locations</p>
          {(tab === 'list' || tab === 'map') && lastUpdatedAt && <Freshness at={new Date(lastUpdatedAt).toISOString()} />}
        </div>
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-neutral-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold tap-target ${
                tab === t.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            <div className="h-56 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : snapshots.length === 0 ? (
          <EmptyState icon={Truck} title="No field salespeople yet" body="Once someone marked as a field salesperson clocks in, they'll appear here." />
        ) : (
          <>
            {tab === 'list' && <FleetListView snapshots={snapshots} />}
            {tab === 'map' && <FleetMapView snapshots={snapshots} />}
            {tab === 'dashboard' && <DashboardTab snapshots={snapshots} />}
            {tab === 'reports' && <ReportsTab team={snapshots.map((s) => s.member)} />}
          </>
        )}
      </div>
    </div>
  )
}
