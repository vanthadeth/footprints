import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart3, ChevronRight, Gauge, History, Truck, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useFleet } from '@/features/fleet/useFleet'
import { TeamPulseCard } from '@/features/fleet/TeamPulse'
import { TeamTodayList } from '@/features/fleet/TeamTodayList'
import { AdminTabs } from '@/components/AdminKit'
import { useAppSettings } from '@/hooks/useAppSettings'
import { formatLongDate, formatTime } from '@/lib/datetime'
import { TeamMapView } from '@/features/fleet/map/TeamMapView'
import { Freshness } from '@/features/fleet/Freshness'
import { DashboardTab } from '@/features/dashboard/DashboardTab'
import { ReportsTab } from '@/features/reports/ReportsTab'
import { ActivityLogTab } from '@/features/reports/ActivityLogTab'
import { CheckInOutTab } from '@/features/fleet/CheckInOutTab'
import { SegmentedControl } from '@/components/SegmentedControl'
import { WeeklyAttendance } from '@/features/attendanceSummary/WeeklyAttendance'
import { MonthlyAttendance } from '@/features/attendanceSummary/MonthlyAttendance'
import { DailyAttendance } from '@/features/attendanceSummary/DailyAttendance'
import { useProfile } from '@/features/auth/useProfile'

type Tab = 'dashboard' | 'map' | 'attendance' | 'kpis' | 'reports' | 'logs'
type AttendanceView = 'daily' | 'weekly' | 'monthly' | 'photos'
const ATTENDANCE_VIEWS: AttendanceView[] = ['daily', 'weekly', 'monthly', 'photos']

const TABS: Tab[] = ['dashboard', 'map', 'attendance', 'kpis', 'reports', 'logs']
/** The three tabs on the canvas; the rest open from links under the dashboard. */
const MAIN: [Tab, string][] = [
  ['dashboard', 'Dashboard'],
  ['map', 'Map'],
  ['attendance', 'Attendance'],
]
const MORE: { key: Tab; label: string; sub: string; icon: LucideIcon }[] = [
  { key: 'reports', label: 'Reports by person', sub: 'Visits, orders and effective time for any period', icon: BarChart3 },
  { key: 'kpis', label: 'Period numbers', sub: 'Clock-ins, visit counts and durations', icon: Gauge },
  { key: 'logs', label: 'Activity log', sub: 'Every clock-in, visit and change', icon: History },
]

/**
 * Team report (canvas Polish › Team report): Dashboard (today's pulse and
 * an expandable card per person), Map and Attendance. Reports by person,
 * period numbers and the activity log open from the dashboard. The tab is
 * kept in the URL (?tab=) so Back returns to it; old ?tab=list links land
 * on the dashboard.
 */
export function FleetPage() {
  const { snapshots: allSnapshots, loading, error, lastUpdatedAt } = useFleet()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const requested = raw === 'checkinout' ? 'attendance' : raw === 'list' ? 'dashboard' : raw
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'dashboard'
  const settings = useAppSettings()
  const view: AttendanceView = ATTENDANCE_VIEWS.includes(params.get('view') as AttendanceView) ? (params.get('view') as AttendanceView) : 'daily'
  const { profile } = useProfile()

  // "My fleet" means the field salespeople actually being tracked -- not
  // every active user who happens to report up to this viewer (HR/back
  // office reports, for instance, never clock in and would just be noise
  // here).
  const snapshots = useMemo(() => allSnapshots.filter((s) => s.member.isFieldSales), [allSnapshots])

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-5xl">
      <div className="space-y-3.5 px-4 pt-3 md:px-8 md:pt-4">
        <AdminTabs tabs={MAIN} value={MAIN.some(([k]) => k === tab) ? tab : 'dashboard'} onChange={(k) => setParams(k === 'dashboard' ? {} : { tab: k }, { replace: true })} />
        {!MAIN.some(([k]) => k === tab) && (
          <Link to="/fleet" className="-mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-brand-500">
            ‹ Dashboard
          </Link>
        )}

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
            {tab === 'dashboard' && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[17px] font-extrabold text-neutral-900">Today</p>
                    <p className="text-xs text-neutral-500">
                      {formatLongDate()} · shift {settings.workStartTime.slice(0, 5)} – {settings.workEndTime.slice(0, 5)}
                    </p>
                  </div>
                  {lastUpdatedAt && (
                    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-status-working/10 px-2 text-[11px] font-bold text-status-working">
                      <span className="h-1.5 w-1.5 rounded-full bg-status-working" />
                      Live · {formatTime(new Date(lastUpdatedAt).toISOString())}
                    </span>
                  )}
                </div>
                <TeamPulseCard snapshots={snapshots} />
                <TeamTodayList snapshots={snapshots} />
                <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
                  {MORE.map((m, i) => (
                    <Link key={m.key} to={`/fleet?tab=${m.key}`} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-neutral-200 text-neutral-900">
                        <m.icon className="h-[17px] w-[17px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-neutral-900">{m.label}</span>
                        <span className="block truncate text-xs text-neutral-500">{m.sub}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                    </Link>
                  ))}
                </div>
              </>
            )}
            {tab === 'map' && (
              <>
                {lastUpdatedAt && <Freshness at={new Date(lastUpdatedAt).toISOString()} />}
                <TeamMapView snapshots={snapshots} />
              </>
            )}
            {tab === 'kpis' && <DashboardTab snapshots={snapshots} />}
            {tab === 'reports' && <ReportsTab team={snapshots.map((s) => s.member)} />}
            {tab === 'logs' && <ActivityLogTab team={snapshots.map((s) => s.member)} />}
            {tab === 'attendance' && (
              <div className="space-y-3.5">
                <SegmentedControl<AttendanceView>
                  ariaLabel="Attendance period"
                  value={view === 'photos' ? 'daily' : view}
                  onChange={(v) => setParams(v === 'daily' ? { tab: 'attendance' } : { tab: 'attendance', view: v }, { replace: true })}
                  options={[
                    { value: 'daily', label: 'Day' },
                    { value: 'weekly', label: 'Week' },
                    { value: 'monthly', label: 'Month' },
                  ]}
                />
                {view === 'daily' && <DailyAttendance team={snapshots.map((s) => s.member)} onShowPhotos={() => setParams({ tab: 'attendance', view: 'photos' }, { replace: true })} />}
                {view === 'photos' && <CheckInOutTab snapshots={snapshots} />}
                {view === 'weekly' && <WeeklyAttendance team={snapshots.map((s) => s.member)} />}
                {view === 'monthly' && <MonthlyAttendance team={snapshots.map((s) => s.member)} canEditCycle={profile?.is_super_admin === true} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
