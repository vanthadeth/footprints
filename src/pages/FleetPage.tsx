import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarCheck, Gauge, History, List, MapPin, Truck, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useFleet } from '@/features/fleet/useFleet'
import { FleetListView } from '@/features/fleet/FleetListView'
import { TeamMapView } from '@/features/fleet/map/TeamMapView'
import { Freshness } from '@/features/fleet/Freshness'
import { DashboardTab } from '@/features/dashboard/DashboardTab'
import { ReportsTab } from '@/features/reports/ReportsTab'
import { ActivityLogTab } from '@/features/reports/ActivityLogTab'
import { CheckInOutTab } from '@/features/fleet/CheckInOutTab'

type Tab = 'list' | 'map' | 'dashboard' | 'reports' | 'logs' | 'attendance'

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'list', label: 'List', icon: List },
  { key: 'map', label: 'Map', icon: MapPin },
  { key: 'dashboard', label: 'Dashboard', icon: Gauge },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'logs', label: 'Logs', icon: History },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
]

/** Supervisor/management view (Hub › Team): live team status (list + map), KPI dashboard, reports, activity log and attendance. The chosen tile is kept in the URL (?tab=) so Back returns to it. */
export function FleetPage() {
  const { snapshots: allSnapshots, loading, error, lastUpdatedAt } = useFleet()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') === 'checkinout' ? 'attendance' : params.get('tab')
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : 'list'

  // "My fleet" means the field salespeople actually being tracked -- not
  // every active user who happens to report up to this viewer (HR/back
  // office reports, for instance, never clock in and would just be noise
  // here).
  const snapshots = useMemo(() => allSnapshots.filter((s) => s.member.isFieldSales), [allSnapshots])
  const counts = useMemo(
    () => ({
      visiting: snapshots.filter((s) => s.status === 'VISITING').length,
      idling: snapshots.filter((s) => s.status === 'IDLING').length,
      off: snapshots.filter((s) => s.status === 'OFF').length,
    }),
    [snapshots]
  )

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-5xl">
      <div className="space-y-3.5 px-4 pt-3 md:px-8 md:pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-neutral-500">Team status and locations</p>
          {(tab === 'list' || tab === 'map') && lastUpdatedAt && <Freshness at={new Date(lastUpdatedAt).toISOString()} />}
        </div>

        <div role="tablist" aria-label="Team views" className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setParams(t.key === 'list' ? {} : { tab: t.key }, { replace: true })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] px-1 py-3 tap-target ${
                  active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-600'
                }`}
              >
                <t.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span className={`text-[11px] ${active ? 'font-bold' : 'font-semibold'}`}>{t.label}</span>
              </button>
            )
          })}
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-56 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : snapshots.length === 0 ? (
          <EmptyState icon={Truck} title="No field salespeople yet" body="Once someone marked as a field salesperson clocks in, they'll appear here." />
        ) : (
          <>
            {tab === 'list' && (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <StatusTile label="Visiting" value={counts.visiting} className="bg-status-visiting" />
                  <StatusTile label="Idling" value={counts.idling} className="bg-earth-500" />
                  <StatusTile label="Off" value={counts.off} className="bg-neutral-500" />
                </div>
                <FleetListView snapshots={snapshots} />
              </>
            )}
            {tab === 'map' && <TeamMapView snapshots={snapshots} />}
            {tab === 'dashboard' && <DashboardTab snapshots={snapshots} />}
            {tab === 'reports' && <ReportsTab team={snapshots.map((s) => s.member)} />}
            {tab === 'logs' && <ActivityLogTab team={snapshots.map((s) => s.member)} />}
            {tab === 'attendance' && <CheckInOutTab snapshots={snapshots} />}
          </>
        )}
      </div>
    </div>
  )
}

function StatusTile({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-2xl px-3.5 py-4 text-white ${className}`}>
      <p className="text-xs font-semibold text-white/85">{label}</p>
      <p className="mt-1.5 text-[30px] font-extrabold leading-none">{value}</p>
    </div>
  )
}
