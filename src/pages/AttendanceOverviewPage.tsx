import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useTeam } from '@/features/fleet/useTeam'
import { addDays, datesBetween, weekStart } from '@/features/attendanceSummary/attendanceCycle'
import { buildDayDetails, type DayDetail, type DetailKind } from '@/features/attendanceSummary/attendanceDetails'
import { KIND_STYLE } from '@/features/attendanceSummary/kindStyle'
import { useAttendanceDays } from '@/features/attendanceSummary/useAttendanceDays'
import { WeekNavigator, WeeklyAttendanceView } from '@/features/attendanceSummary/WeeklyAttendance'
import { formatTime } from '@/lib/datetime'
import { todayDateString } from '@/lib/dateRange'
import { Users as UsersIcon } from 'lucide-react'

type Filter = 'all' | 'late' | 'absent' | 'leave'
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['late', 'Late'],
  ['absent', 'Absent'],
  ['leave', 'Leave'],
]
const KIND_FILTER: Record<DetailKind, Filter> = { absent: 'absent', notin: 'absent', late: 'late', leave: 'leave', dayoff: 'leave' }

const dayTitle = (day: string, today: string) => {
  const long = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  return day === today ? `Today · ${long}` : day === addDays(today, -1) ? `Yesterday · ${long}` : long
}

/**
 * Attendance (everyone you can see), by week: a week navigator, the Weekly
 * attendance numbers and grid, then each day of that week, newest first, with
 * the people who were late, absent or on leave.
 */
export function AttendanceOverviewPage() {
  const today = todayDateString()
  const { team, loading: teamLoading, error: teamError } = useTeam()
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const from = weekStart(today, offset)
  const to = addDays(from, 6)
  const ids = useMemo(() => team.map((m) => m.id), [team])
  const { rows, loading, error } = useAttendanceDays(from, to, ids)
  const nowHm = formatTime(new Date().toISOString())
  const details = useMemo(() => buildDayDetails(rows, team, datesBetween(from, to), today, nowHm), [rows, team, from, to, today, nowHm])

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-10 pt-1.5 md:max-w-3xl md:px-8 lg:max-w-[1440px] lg:pt-6">
      <div className="lg:max-w-xl">
        <WeekNavigator offset={offset} onChange={setOffset} from={from} to={to} />
      </div>

      {teamError && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{teamError}</p>}

      {!teamLoading && team.length === 0 && !teamError ? (
        <EmptyState icon={UsersIcon} title="No people to show" body="Once people report to you or are in your scope, their attendance appears here." />
      ) : (
        <>
          <WeeklyAttendanceView team={team} from={from} to={to} rows={rows} loading={loading || teamLoading} error={error} />

          <section aria-label="Details by day" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.06em] text-neutral-500">Details by day</h2>
              <div role="group" aria-label="Show" className="flex gap-1.5">
                {FILTERS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                    className={`h-8 rounded-full border px-3 text-[12.5px] font-bold ${filter === k ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900' : 'border-neutral-200 bg-white text-neutral-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading && details.length === 0 ? (
              <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
            ) : details.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-[13.5px] text-neutral-500 shadow-card">No working days to show for this week yet.</p>
            ) : (
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
                {details.map((d) => (
                  <DayBlock key={d.day} detail={d} title={dayTitle(d.day, today)} filter={filter} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function DayBlock({ detail: d, title, filter }: { detail: DayDetail; title: string; filter: Filter }) {
  const [showOnTime, setShowOnTime] = useState(false)
  const items = d.items.filter((i) => filter === 'all' || KIND_FILTER[i.kind] === filter)
  const absent = d.counts.absent + d.counts.notin
  const leave = d.counts.leave + d.counts.dayoff
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-100 px-3.5 py-2.5 dark:border-neutral-800">
        <h3 className="min-w-0 flex-1 text-[14px] font-extrabold text-neutral-900">{title}</h3>
        {d.holiday ? (
          <span className="rounded-full bg-earth-50 px-2 py-0.5 text-[11px] font-extrabold text-earth-500">Holiday</span>
        ) : (
          <span className="flex gap-2 text-[11.5px] font-bold">
            {d.counts.late > 0 && <span className="text-status-warn">{d.counts.late} late</span>}
            {absent > 0 && <span className="text-status-danger">{absent} {d.counts.notin && !d.counts.absent ? 'not in' : 'absent'}</span>}
            {leave > 0 && <span className="text-brand-600">{leave} leave</span>}
            {d.counts.late + absent + leave === 0 && <span className="text-status-working">All on time</span>}
          </span>
        )}
      </div>

      {d.holiday ? (
        <p className="px-3.5 py-3 text-[13px] text-neutral-600">{d.holiday} · public holiday, nobody scheduled</p>
      ) : (
        <>
          {items.length === 0 && <p className="px-3.5 py-3 text-[13px] text-neutral-500">{filter === 'all' ? 'Everyone scheduled was on time.' : 'Nobody here.'}</p>}
          {items.map((i, n) => {
            const st = KIND_STYLE[i.kind]
            return (
              <div key={`${i.userId}-${i.kind}`} className={`flex items-center gap-3 px-3.5 py-2.5 ${n ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{i.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-neutral-900">{i.name}</span>
                  <span className="block truncate text-[11.5px] text-neutral-500">{[i.department, st.sub(i)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${st.tag}`}>{st.label(i)}</span>
              </div>
            )
          })}
          {d.onTime.length > 0 && filter === 'all' && (
            <button type="button" onClick={() => setShowOnTime(!showOnTime)} aria-expanded={showOnTime} className="flex w-full items-center gap-1.5 border-t border-neutral-100 px-3.5 py-2 text-left text-[12px] font-bold text-neutral-500 dark:border-neutral-800">
              <ChevronRight className={`h-3 w-3 transition-transform ${showOnTime ? 'rotate-90' : ''}`} aria-hidden />
              {d.onTime.length} on time
            </button>
          )}
          {showOnTime &&
            d.onTime.map((p) => (
              <div key={p.userId} className="flex items-center gap-3 border-t border-neutral-100 px-3.5 py-2 dark:border-neutral-800">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-extrabold text-neutral-600">{p.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">
                  {p.name}
                  {p.department ? <span className="text-neutral-500"> · {p.department}</span> : null}
                </span>
                {p.firstIn && <span className="shrink-0 text-[12px] tabular-nums text-neutral-500">in {formatTime(p.firstIn)}</span>}
              </div>
            ))}
        </>
      )}
    </section>
  )
}
