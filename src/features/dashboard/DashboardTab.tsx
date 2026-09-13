import { useState } from 'react'
import { StatTile } from '@/components/StatTile'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { computeLiveFleetKpis, computeVisitKpis } from '@/features/reports/reportStats'
import { useFleetHistory } from '@/features/reports/useFleetHistory'
import { formatDuration } from '@/lib/datetime'
import { getPresetRange } from '@/lib/dateRange'
import type { FleetMemberSnapshot } from '@/features/fleet/types'

/** Key Matrix / management dashboard (spec §37): live attendance+fleet counts, date-filterable visit and coverage KPIs. */
export function DashboardTab({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const [range, setRange] = useState(() => getPresetRange('today'))
  const userIds = snapshots.map((s) => s.member.id)
  const { visits, loading } = useFleetHistory(userIds, range)

  const live = computeLiveFleetKpis(snapshots)
  const visitKpis = computeVisitKpis(visits, snapshots.length)

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Attendance — Right Now</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Clocked In" value={String(live.clockedIn)} />
          <StatTile label="Clocked Out" value={String(live.clockedOut)} />
          <StatTile label="Not Started" value={String(live.notStarted)} />
          <StatTile label="Avg. Clock In" value={live.avgClockInTime} />
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Fleet — Right Now</p>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Visiting" value={String(live.visiting)} />
          <StatTile label="Idling" value={String(live.idling)} />
          <StatTile label="Off" value={String(live.off)} />
        </div>
        {live.trackingIssues > 0 && <p className="mt-2 px-1 text-xs text-status-warn">{live.trackingIssues} location tracking issue(s)</p>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Visits &amp; Coverage</p>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl2 bg-neutral-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile label="Total Visits" value={String(visitKpis.totalVisits)} />
            <StatTile label="Avg. Visits / User" value={visitKpis.avgVisitsPerUser.toFixed(1)} />
            <StatTile label="Avg. Visit Duration" value={formatDuration(visitKpis.avgVisitDurationMs)} />
            <StatTile label="Total Visiting Time" value={formatDuration(visitKpis.totalVisitingMs)} />
            <StatTile label="Unique Customers" value={String(visitKpis.uniqueCustomers)} />
            <StatTile
              label="Unassigned / Auto / Flagged"
              value={`${visitKpis.unassignedVisits} / ${visitKpis.autoCheckouts} / ${visitKpis.flaggedVisits}`}
            />
          </div>
        )}
      </section>
    </div>
  )
}
