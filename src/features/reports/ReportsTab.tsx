import { useVisitOrders } from '@/features/orders/useVisitOrders'
import { useState } from 'react'
import { Footprints as FootprintsIcon } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { JourneyHistoryReport } from '@/features/attendance/JourneyHistoryReport'
import { PeriodChips } from './PeriodChips'
import { useFleetHistory } from './useFleetHistory'
import { computeUserReportRows, computeVisitKpis, type UserReportRow } from './reportStats'
import { formatDuration } from '@/lib/datetime'
import { getPresetRange, localDateKey } from '@/lib/dateRange'
import { useAttendanceDays } from '@/features/attendanceSummary/useAttendanceDays'
import { useAppSettings } from '@/hooks/useAppSettings'
import { uniqueCustomerTarget } from '@/features/attendance/efficiency'
import { BAND_LABEL, BAND_STYLE, formatScore, meanScore, scoreBand, scoreDay } from '@/features/attendance/effectivenessScore'
import { displayName } from '@/lib/displayName'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import type { TeamMember } from '@/features/fleet/types'

type View = 'team' | 'user'

const NO_DEPARTMENT = 'No Department'
/** attendance_days answers at most this many days; a longer period falls back to time clocked in. */
const MAX_PAID_DAYS = 62

/** Team › Reports: the team's visits and effectiveness by department (By Team) or per person (By User), for a chosen period. */
export function ReportsTab({ team }: { team: TeamMember[] }) {
  const [view, setView] = useState<View>('team')
  const [range, setRange] = useState(() => getPresetRange('this_week'))
  const [historyUserId, setHistoryUserId] = useState<string | null>(null)
  const userIds = team.map((m) => m.id)
  const { attendance, visits, loading } = useFleetHistory(userIds, range)
  const { shortVisitThresholdMinutes, flagRules } = useAppSettings()
  const orderStates = useVisitOrders(visits)
  // Paid working time per person as the server counts it (unpaid break off), so
  // effectiveness is on the same basis as "hours worked" everywhere else.
  const fromKey = localDateKey(range.startIso)
  const toKey = localDateKey(new Date(Math.min(Date.parse(range.endIso) - 1, Date.now())).toISOString())
  const { rows: dayRows } = useAttendanceDays(fromKey, toKey, userIds)
  const withinServerWindow = (Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000 + 1 <= MAX_PAID_DAYS
  const paidMsByUser: Record<string, number> | undefined = withinServerWindow && dayRows.length ? {} : undefined
  if (paidMsByUser) for (const r of dayRows) paidMsByUser[r.userId] = (paidMsByUser[r.userId] ?? 0) + r.workedMinutes * 60_000

  // The unique customers expected, and each person's score, from the server's day feed: its paid time and each day's own hours.
  const scheduledByUser: Record<string, { uniqueTarget: number }> | undefined = withinServerWindow && dayRows.length ? {} : undefined
  const scoreByUser: Record<string, number | null> | undefined = scheduledByUser ? {} : undefined
  if (scheduledByUser && scoreByUser) {
    const now = Date.now()
    const dailyScores: Record<string, (number | null)[]> = {}
    for (const r of dayRows) {
      const dayVisits = visits.filter((v) => v.user_id === r.userId && !v.cancelled_at && localDateKey(v.checked_in_at) === r.day)
      const sessions = attendance.filter((a) => a.user_id === r.userId && localDateKey(a.clock_in_at) === r.day)
      const rule = { breakMinutes: 0, breakPaid: true, start: r.scheduledStart ?? undefined, end: r.scheduledEnd ?? undefined }
      if (r.firstIn) {
        const sc = scoreDay(sessions.length ? sessions : [{ clock_in_at: r.firstIn, clock_out_at: r.lastOut }], dayVisits, r.day, rule, now, flagRules, r.workedMinutes * 60_000, orderStates)
        ;(dailyScores[r.userId] ??= []).push(sc.score)
        scheduledByUser[r.userId] = { uniqueTarget: (scheduledByUser[r.userId]?.uniqueTarget ?? 0) + uniqueCustomerTarget(rule, flagRules) }
      }
    }
    for (const [id, list] of Object.entries(dailyScores)) scoreByUser[id] = meanScore(list)
  }

  const rows = computeUserReportRows(
    team.map((m) => ({ id: m.id, fullName: m.fullName, nickname: m.nickname, departmentId: m.departmentId, departmentName: m.departmentName })),
    attendance,
    visits,
    undefined,
    paidMsByUser,
    flagRules,
    scheduledByUser,
    scoreByUser,
    orderStates
  )
  const kpis = computeVisitKpis(visits, team.length, undefined, shortVisitThresholdMinutes, flagRules.forgottenCapMin)
  const groups = groupBy(rows, (r) => r.departmentName ?? NO_DEPARTMENT)
  const deptKeys = sortGroupKeys(groups.keys(), NO_DEPARTMENT)
  const teamScore = meanScore(rows.map((r) => r.score))
  const totalUniqueDays = rows.reduce((a, r) => a + r.uniqueCustomerDays, 0)
  const totalUniqueTarget = rows.reduce((a, r) => a + r.uniqueCustomerTarget, 0)
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
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <Kpi label="Working days" value={String(rows.reduce((s, r) => s + r.workingDays, 0))} />
            <Kpi label="Total visits" value={String(kpis.totalVisits)} />
            <Kpi label="Avg visits / person" value={kpis.avgVisitsPerUser.toFixed(1)} />
            <Kpi label="Short visits" value={String(kpis.shortVisits)} />
            <Kpi label="Unique customers" value={totalUniqueTarget > 0 ? `${totalUniqueDays} / ${totalUniqueTarget}` : String(totalUniqueDays)} />
            <Kpi label="Effectiveness" value={teamScore != null ? `${formatScore(teamScore)} / 10` : '—'} good={teamScore != null ? teamScore >= 7 : undefined} />
          </div>
          <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {deptKeys.map((key) => {
              const list = groups.get(key)!
              const work = list.reduce((a, r) => a + r.totalWorkingMs, 0)
              const visit = list.reduce((a, r) => a + r.totalVisitMs, 0)
              const eff = meanScore(list.map((r) => r.score))
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
                    <div className={`h-full rounded-full ${eff != null ? BAND_STYLE[scoreBand(eff)].fill : 'bg-neutral-200'}`} style={{ width: `${Math.min(100, (eff ?? 0) * 10)}%` }} />
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
            const eff = meanScore(list.map((r) => r.score))
            return (
              <section key={key} className="space-y-2">
                <div className="flex items-baseline justify-between px-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{key}</h3>
                  <span className="text-xs text-neutral-500">{eff != null ? `Score ${formatScore(eff)}` : '—'}</span>
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
  const eff = row.score
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
      <div className="grid grid-cols-4 gap-1.5">
        <Mini label="Customers" value={row.uniqueCustomerTarget > 0 ? `${row.uniqueCustomerDays} / ${row.uniqueCustomerTarget}` : String(row.uniqueCustomerDays)} />
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
          good === undefined ? 'text-neutral-900' : good ? 'text-status-working' : 'text-status-warn'
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

function EffChip({ value }: { value: number | null }) {
  if (value == null) return null
  const band = scoreBand(value)
  const style = BAND_STYLE[band]
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${style.soft} ${style.text}`}>
      {formatScore(value)} · {BAND_LABEL[band]}
    </span>
  )
}
