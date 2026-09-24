import { useState } from 'react'
import { Footprints as FootprintsIcon } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { JourneyHistoryReport } from '@/features/attendance/JourneyHistoryReport'
import { PeriodChips } from './PeriodChips'
import { useFleetHistory } from './useFleetHistory'
import { computeUserReportRows, computeVisitKpis, type UserReportRow } from './reportStats'
import { formatDuration } from '@/lib/datetime'
import { getPresetRange } from '@/lib/dateRange'
import { displayName } from '@/lib/displayName'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import type { TeamMember } from '@/features/fleet/types'

type View = 'team' | 'user'

const NO_DEPARTMENT = 'No Department'
/** Visiting ÷ working at or above this reads as healthy (green); below it, as needing attention (orange). */
const GOOD_EFFECTIVENESS = 0.3

function ratio(visitMs: number, workMs: number): number {
  return workMs > 0 ? visitMs / workMs : 0
}

/** Team › Reports: the team's visits and effectiveness by department (By Team) or per person (By User), for a chosen period. */
export function ReportsTab({ team }: { team: TeamMember[] }) {
  const [view, setView] = useState<View>('team')
  const [range, setRange] = useState(() => getPresetRange('this_week'))
  const [historyUserId, setHistoryUserId] = useState<string | null>(null)
  const userIds = team.map((m) => m.id)
  const { attendance, visits, loading } = useFleetHistory(userIds, range)

  const rows = computeUserReportRows(
    team.map((m) => ({ id: m.id, fullName: m.fullName, nickname: m.nickname, departmentId: m.departmentId, departmentName: m.departmentName })),
    attendance,
    visits
  )
  const kpis = computeVisitKpis(visits, team.length)
  const groups = groupBy(rows, (r) => r.departmentName ?? NO_DEPARTMENT)
  const deptKeys = sortGroupKeys(groups.keys(), NO_DEPARTMENT)
  const totalWork = rows.reduce((a, r) => a + r.totalWorkingMs, 0)
  const totalVisit = rows.reduce((a, r) => a + r.totalVisitMs, 0)
  const historyRow = rows.find((r) => r.userId === historyUserId) ?? null

  return (
    <div className="space-y-3.5">
      <SegmentedControl
        ariaLabel="Report view"
        value={view}
        onChange={setView}
        shape="tabs"
        options={[
          { value: 'team', label: 'By Team' },
          { value: 'user', label: 'By User' },
        ]}
      />
      <PeriodChips value={range} onChange={setRange} />
      <p className="px-0.5 text-[12.5px] text-neutral-500">
        {range.label} · {team.length} people · {deptKeys.length} {deptKeys.length === 1 ? 'department' : 'departments'}
      </p>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-40 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      ) : view === 'team' ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Kpi label="Working days" value={String(rows.reduce((s, r) => s + r.workingDays, 0))} />
            <Kpi label="Total visits" value={String(kpis.totalVisits)} />
            <Kpi label="Avg visits / person" value={kpis.avgVisitsPerUser.toFixed(1)} />
            <Kpi label="Effectiveness" value={`${Math.round(ratio(totalVisit, totalWork) * 100)}%`} good={ratio(totalVisit, totalWork) >= GOOD_EFFECTIVENESS} />
          </div>
          <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {deptKeys.map((key) => {
              const list = groups.get(key)!
              const work = list.reduce((a, r) => a + r.totalWorkingMs, 0)
              const visit = list.reduce((a, r) => a + r.totalVisitMs, 0)
              const eff = ratio(visit, work)
              return (
                <div key={key} className="space-y-3 rounded-2xl bg-white p-3.5 shadow-card">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-neutral-900">{key}</p>
                      <p className="text-xs text-neutral-500">{list.length} {list.length === 1 ? 'person' : 'people'}</p>
                    </div>
                    <EffChip value={eff} />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div className={`h-full rounded-full ${eff >= GOOD_EFFECTIVENESS ? 'bg-status-working' : 'bg-status-warn'}`} style={{ width: `${Math.min(100, eff * 100)}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Mini label="Visits" value={String(list.reduce((a, r) => a + r.visitCount, 0))} />
                    <Mini label="Working" value={formatDuration(work)} />
                    <Mini label="Visiting" value={formatDuration(visit)} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {deptKeys.map((key) => {
            const list = groups.get(key)!
            const eff = ratio(
              list.reduce((a, r) => a + r.totalVisitMs, 0),
              list.reduce((a, r) => a + r.totalWorkingMs, 0)
            )
            return (
              <section key={key} className="space-y-2">
                <div className="flex items-baseline justify-between px-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{key}</h3>
                  <span className="text-xs text-neutral-500">{Math.round(eff * 100)}% effective</span>
                </div>
                <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                  {list.map((r) => (
                    <UserCard key={r.userId} row={r} onFootprints={() => setHistoryUserId(r.userId)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {!loading && rows.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500 shadow-card">No data for this period.</p>}

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

function UserCard({ row, onFootprints }: { row: UserReportRow; onFootprints: () => void }) {
  const name = displayName(row.fullName, row.nickname)
  const eff = ratio(row.totalVisitMs, row.totalWorkingMs)
  const initials = row.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="space-y-3 rounded-2xl bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-extrabold text-brand-700">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold text-neutral-900">{name}</p>
          <p className="text-xs text-neutral-500">
            {row.workingDays} {row.workingDays === 1 ? 'day' : 'days'} · {formatDuration(row.totalWorkingMs)} worked
          </p>
        </div>
        <EffChip value={eff} />
      </div>
      <div className="grid grid-cols-4 gap-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <Mini label="Visits" value={String(row.visitCount)} />
        <Mini label="Visit time" value={formatDuration(row.totalVisitMs)} />
        <Mini label="Avg visit" value={row.visitCount ? formatDuration(row.avgVisitMs) : '—'} />
        <Mini label="Idle" value={formatDuration(row.totalGapMs)} />
      </div>
      <button
        onClick={onFootprints}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-50 text-xs font-bold text-brand-700 tap-target"
      >
        <FootprintsIcon className="h-3.5 w-3.5" aria-hidden /> View Footprints
      </button>
    </div>
  )
}

function Kpi({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-card">
      <p className="text-xs font-semibold text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-extrabold tracking-tight ${
          good === undefined ? 'text-neutral-900' : good ? 'text-status-working dark:text-emerald-300' : 'text-status-warn'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="truncate text-[13px] font-bold text-neutral-900">{value}</p>
    </div>
  )
}

function EffChip({ value }: { value: number }) {
  const good = value >= GOOD_EFFECTIVENESS
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        good ? 'bg-status-working/10 text-status-working dark:text-emerald-300' : 'bg-status-warn/10 text-status-warn'
      }`}
    >
      {Math.round(value * 100)}% effective
    </span>
  )
}
