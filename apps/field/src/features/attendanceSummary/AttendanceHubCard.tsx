import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Check, ChevronRight } from 'lucide-react'
import { useTeam } from '@/features/fleet/useTeam'
import { formatTime } from '@footprints/shared/lib/datetime'
import { todayDateString } from '@/lib/dateRange'
import { addDays, datesBetween, shortDate, weekStart } from './attendanceCycle'
import { formatDays, formatRate } from './attendanceSummary'
import { Kpi, Legend } from './AttendanceParts'
import { KIND_STYLE } from './kindStyle'
import { buildHubSummary, type HubDay } from './hubSummary'
import { useAttendanceDays } from './useAttendanceDays'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MAX_NAMES = 3

type CellKind = 'late' | 'absent' | 'leave'
const CELL: Record<CellKind, string> = {
  late: 'border-[1.5px] border-status-warn bg-status-warn/10 text-status-warn',
  absent: 'border-[1.5px] border-status-danger bg-status-danger/10 text-status-danger',
  leave: 'bg-brand-50 text-brand-700',
}

/** One count in the week grid, in the same boxes as the Weekly attendance cells; blank when nothing happened or the day isn't counted. */
function CountCell({ kind, day, n }: { kind: CellKind; day: HubDay; n: number }) {
  const base = 'flex h-[30px] items-center justify-center rounded-md text-[10.5px] font-extrabold'
  if (!day.scheduled) return <span className="h-[30px] rounded-md bg-neutral-50" aria-hidden />
  if (n === 0) return <span className={`${base} text-neutral-300`}>·</span>
  return <span className={`${base} ${CELL[kind]}`}>{n}</span>
}

/**
 * Hub › For you: this week's attendance at a glance, built from the pieces of the
 * Weekly attendance view (number tiles, the week grid's boxes, status pills). One
 * link to the full Attendance page. Shows a slim link while loading fails or
 * when there is nobody to show, so the shortcut never disappears.
 */
export function AttendanceHubCard() {
  const today = todayDateString()
  const { team, loading: teamLoading, error: teamError } = useTeam()
  const from = weekStart(today)
  const to = addDays(from, 6)
  const days = useMemo(() => datesBetween(from, to), [from, to])
  const ids = useMemo(() => team.map((m) => m.id), [team])
  const { rows, loading, error } = useAttendanceDays(from, to, ids)
  const nowHm = formatTime(new Date().toISOString())
  const summary = useMemo(() => buildHubSummary(rows, team, days, today, nowHm), [rows, team, days, today, nowHm])

  if (teamError || error || (!teamLoading && team.length === 0)) {
    return (
      <Link to="/attendance" className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-3.5 shadow-card">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-500">
          <CalendarCheck className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-bold text-neutral-900">All attendance</span>
        <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
      </Link>
    )
  }
  if (teamLoading || (loading && rows.length === 0)) {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="h-9 animate-pulse rounded-xl bg-neutral-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }

  const shown = summary.todayItems.slice(0, MAX_NAMES)
  const more = summary.todayItems.length - shown.length

  return (
    <Link to="/attendance" aria-label="Attendance this week, open all attendance" className="block space-y-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-500">
          <CalendarCheck className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-neutral-900">Attendance</span>
          <span className="block text-xs text-neutral-500">
            This week · {shortDate(from)} – {shortDate(to)}
          </span>
        </span>
        <span className="flex items-center gap-0.5 text-[13px] font-bold text-brand-600">
          Open <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
        <Kpi label="Attendance" value={formatRate(summary.rate)} sub={`${summary.present} of ${summary.scheduled} days · leave excluded`} className="col-span-3 md:col-span-1" />
        <Kpi label="Late" value={String(summary.late)} sub={summary.late ? `${summary.lateMinutes} min in total` : 'None'} tone="text-status-warn" />
        <Kpi label="Absent" value={String(summary.absent)} sub="No clock-in" tone="text-status-danger" />
        <Kpi label="On leave" value={`${formatDays(summary.leaveDays)} d`} sub="Approved leave" tone="text-brand-600" />
      </div>

      <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
        <div className="rounded-2xl bg-white px-2.5 pb-2.5 pt-3 shadow-card">
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] items-end gap-[3px] px-0.5 pb-1.5">
            <span />
            {summary.perDay.map((d, i) => (
              <span key={d.day} className={`text-center text-[10.5px] font-bold leading-tight ${d.day === today ? 'text-brand-600' : i >= 5 ? 'text-neutral-300' : 'text-neutral-500'}`}>
                {DOW[i]}
                <br />
                {Number(d.day.slice(8))}
              </span>
            ))}
          </div>
          {(
            [
              ['late', 'Late'],
              ['absent', 'Absent'],
              ['leave', 'Leave'],
            ] as [CellKind, string][]
          ).map(([kind, label]) => (
            <div key={kind} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] items-center gap-[3px] px-0.5 py-[2px]">
              <span className="text-[11.5px] font-bold text-neutral-600">{label}</span>
              {summary.perDay.map((d) => (
                <CountCell key={d.day} kind={kind} day={d} n={d[kind]} />
              ))}
            </div>
          ))}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-100 px-1 pt-2.5 text-[11px] text-neutral-500 dark:border-neutral-800">
            <Legend className="border-[1.5px] border-status-warn bg-status-warn/10" label="Late" />
            <Legend className="border-[1.5px] border-status-danger bg-status-danger/10" label="Absent" />
            <Legend className="bg-brand-50" label="Leave" />
          </div>
        </div>

        <div className="rounded-2xl bg-white px-3.5 pb-2 pt-3 shadow-card">
          <p className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide text-neutral-500">
            Needs a look today
            {summary.todayItems.length > 0 && <span className="font-bold normal-case tracking-normal">{summary.todayItems.length} {summary.todayItems.length === 1 ? 'person' : 'people'}</span>}
          </p>
          {shown.length === 0 ? (
            <p className="flex items-center gap-1.5 py-3 text-[13px] font-semibold text-status-working">
              <Check className="h-4 w-4" aria-hidden /> Everyone is in or on leave today
            </p>
          ) : (
            <ul>
              {shown.map((i) => (
                <li key={i.userId} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-neutral-900">{i.name}</span>
                    <span className="block truncate text-[10.5px] text-neutral-500">{i.department ?? KIND_STYLE[i.kind].sub(i)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${KIND_STYLE[i.kind].tag}`}>{KIND_STYLE[i.kind].label(i)}</span>
                </li>
              ))}
            </ul>
          )}
          {more > 0 && <p className="pb-1 pt-0.5 text-[11.5px] font-semibold text-neutral-500">+{more} more</p>}
        </div>
      </div>
    </Link>
  )
}
