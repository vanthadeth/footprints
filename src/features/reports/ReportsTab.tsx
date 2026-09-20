import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { StatTile } from '@/components/StatTile'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { JourneyHistoryReport } from '@/features/attendance/JourneyHistoryReport'
import { useFleetHistory } from './useFleetHistory'
import { computeUserReportRows, computeVisitKpis } from './reportStats'
import { formatDuration } from '@/lib/datetime'
import { getPresetRange } from '@/lib/dateRange'
import { displayName } from '@/lib/displayName'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import type { TeamMember } from '@/features/fleet/types'

type ReportKind = 'user' | 'fleet'

export function ReportsTab({ team }: { team: TeamMember[] }) {
  const [kind, setKind] = useState<ReportKind>('fleet')
  const [range, setRange] = useState(() => getPresetRange('this_week'))
  const userIds = team.map((m) => m.id)
  const { attendance, visits, loading } = useFleetHistory(userIds, range)

  const rows = computeUserReportRows(
    team.map((m) => ({ id: m.id, fullName: m.fullName, nickname: m.nickname, departmentId: m.departmentId, departmentName: m.departmentName })),
    attendance,
    visits
  )
  const fleetKpis = computeVisitKpis(visits, team.length)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-neutral-100 p-1">
          {(['fleet', 'user'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold tap-target ${
                kind === k ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {k === 'fleet' ? 'By Team' : 'By User'}
            </button>
          ))}
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl2 bg-neutral-100" />
      ) : kind === 'fleet' ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Working Days (total)" value={String(rows.reduce((s, r) => s + r.workingDays, 0))} />
            <StatTile label="Total Visits" value={String(fleetKpis.totalVisits)} />
            <StatTile label="Avg. Visits / Person" value={fleetKpis.avgVisitsPerUser.toFixed(1)} />
            <StatTile label="Total Visiting Hours" value={formatDuration(fleetKpis.totalVisitingMs)} />
          </div>
          <ReportTable rows={rows} />
        </>
      ) : (
        <ReportTable rows={rows} />
      )}
    </div>
  )
}

const NO_DEPARTMENT = 'No Department'
const COLUMN_COUNT = 11

function ReportTable({ rows }: { rows: ReturnType<typeof computeUserReportRows> }) {
  const [historyUserId, setHistoryUserId] = useState<string | null>(null)
  const historyRow = rows.find((r) => r.userId === historyUserId) ?? null

  const groups = groupBy(rows, (r) => r.departmentName ?? NO_DEPARTMENT)
  const orderedKeys = sortGroupKeys(groups.keys(), NO_DEPARTMENT)

  return (
    <div className="mt-4 overflow-x-auto rounded-xl2 bg-white shadow-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-3 py-3 font-medium">Days</th>
            <th className="px-3 py-3 font-medium">Working Time</th>
            <th className="px-3 py-3 font-medium">Visits</th>
            <th className="px-3 py-3 font-medium">Visit Time</th>
            <th className="px-3 py-3 font-medium">Avg Visit</th>
            <th className="px-3 py-3 font-medium">Gap Time</th>
            <th className="px-3 py-3 font-medium">Customers</th>
            <th className="px-3 py-3 font-medium">Unassigned</th>
            <th className="px-3 py-3 font-medium">Auto Checkouts</th>
            <th className="px-3 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 &&
            orderedKeys.map((key) => (
              <RowsForDepartment key={key} departmentLabel={key} rows={groups.get(key)!} onViewHistory={setHistoryUserId} />
            ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-4 py-8 text-center text-neutral-400">
                No data for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <FullScreenSheet
        open={!!historyRow}
        onClose={() => setHistoryUserId(null)}
        label={historyRow ? `${displayName(historyRow.fullName, historyRow.nickname)} Footprints` : ''}
      >
        {historyRow && (
          <div className="h-full overflow-y-auto pt-16">
            <JourneyHistoryReport userId={historyRow.userId} interactive={false} subtitle={displayName(historyRow.fullName, historyRow.nickname)} />
          </div>
        )}
      </FullScreenSheet>
    </div>
  )
}

function RowsForDepartment({
  departmentLabel,
  rows,
  onViewHistory,
}: {
  departmentLabel: string
  rows: ReturnType<typeof computeUserReportRows>
  onViewHistory: (userId: string) => void
}) {
  return (
    <>
      <tr className="bg-neutral-50">
        <td colSpan={COLUMN_COUNT} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {departmentLabel}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.userId} className="border-b border-neutral-50 last:border-0">
          <td className="px-4 py-3 font-medium text-neutral-900">{displayName(r.fullName, r.nickname)}</td>
          <td className="px-3 py-3 text-neutral-600">{r.workingDays}</td>
          <td className="px-3 py-3 text-neutral-600">{formatDuration(r.totalWorkingMs)}</td>
          <td className="px-3 py-3 text-neutral-600">{r.visitCount}</td>
          <td className="px-3 py-3 text-neutral-600">{formatDuration(r.totalVisitMs)}</td>
          <td className="px-3 py-3 text-neutral-600">{formatDuration(r.avgVisitMs)}</td>
          <td className="px-3 py-3 text-neutral-600">{formatDuration(r.totalGapMs)}</td>
          <td className="px-3 py-3 text-neutral-600">{r.uniqueCustomers}</td>
          <td className="px-3 py-3 text-neutral-600">{r.unassignedVisits}</td>
          <td className="px-3 py-3 text-neutral-600">{r.autoCheckouts}</td>
          <td className="px-3 py-3">
            <button
              onClick={() => onViewHistory(r.userId)}
              aria-label={`View ${displayName(r.fullName, r.nickname)}'s footprints`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-500 tap-target hover:bg-brand-50"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}
