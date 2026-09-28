import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import type { TeamMember } from '@/features/fleet/types'
import { displayName } from '@/lib/displayName'
import { formatTime } from '@/lib/datetime'
import { todayDateString } from '@/lib/dateRange'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import { addDays, datesBetween, shortDate, weekStart } from './attendanceCycle'
import { formatDays, formatRate, teamKpis, totalsByPerson, type AttendanceDay } from './attendanceSummary'
import { DayCell } from './DayCell'
import { useAttendanceDays } from './useAttendanceDays'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const NO_DEPARTMENT = 'No department'
const hours = (min: number) => (min / 60).toFixed(1)

/** Team › Attendance › Weekly: KPIs and a Mon–Sun grid per person, grouped by department, for one week. */
export function WeeklyAttendance({ team }: { team: TeamMember[] }) {
  const today = todayDateString()
  const [offset, setOffset] = useState(0)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [personId, setPersonId] = useState<string | null>(null)
  const from = weekStart(today, offset)
  const to = addDays(from, 6)
  const days = datesBetween(from, to)
  const ids = useMemo(() => team.map((m) => m.id), [team])
  const { rows, loading, error } = useAttendanceDays(from, to, ids)

  const byPerson = useMemo(() => {
    const m = new Map<string, Map<string, AttendanceDay>>()
    for (const r of rows) {
      const inner = m.get(r.userId) ?? new Map<string, AttendanceDay>()
      inner.set(r.day, r)
      m.set(r.userId, inner)
    }
    return m
  }, [rows])
  const totals = useMemo(() => totalsByPerson(rows), [rows])
  const k = useMemo(() => teamKpis(totals.values()), [totals])
  const groups = groupBy(team, (m) => m.departmentName ?? NO_DEPARTMENT)
  const keys = sortGroupKeys(groups.keys(), NO_DEPARTMENT)
  const holidaysThisWeek = [...new Set(rows.filter((r) => r.status === 'holiday' && r.holidayName).map((r) => `${DOW[days.indexOf(r.day)]} ${Number(r.day.slice(8))}: ${r.holidayName}`))]
  const person = personId ? team.find((m) => m.id === personId) : undefined

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOffset(offset - 1)} aria-label="Previous week" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="text-center">
          <p className="text-base font-bold text-neutral-900">
            {shortDate(from)} – {shortDate(to)}
          </p>
          <p className="text-xs text-neutral-500">{offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `${-offset} weeks ago`}</p>
        </div>
        <button type="button" onClick={() => setOffset(Math.min(0, offset + 1))} disabled={offset >= 0} aria-label="Next week" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target disabled:opacity-40">
          <ChevronRight className="h-[18px] w-[18px]" />
        </button>
      </div>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Attendance" value={formatRate(k.rate)} sub={`${k.present} of ${k.scheduled} days · leave excluded`} className="col-span-2 md:col-span-1" />
        <Kpi label="Late arrivals" value={String(k.late)} sub={k.late ? `${k.lateMinutes} min in total` : 'None'} tone="text-status-warn" />
        <Kpi label="Absent" value={String(k.absent)} sub="No clock-in, no leave" tone="text-status-danger" />
        <Kpi label="On leave" value={`${formatDays(k.leaveDays)} d`} sub="Approved leave" tone="text-brand-600" />
        <Kpi label="Hours worked" value={hours(k.workedMinutes)} sub={holidaysThisWeek[0] ?? 'Unpaid breaks excluded'} className="md:col-span-1" />
      </div>

      <div className="rounded-2xl bg-white px-2.5 pb-2.5 pt-3 shadow-card">
        <div className="grid grid-cols-[84px_repeat(7,minmax(0,1fr))_40px] items-end gap-[3px] px-0.5 pb-1.5">
          <span />
          {days.map((d, i) => (
            <span key={d} className={`text-center text-[10.5px] font-bold leading-tight ${d === today ? 'text-brand-600' : i >= 5 ? 'text-neutral-300' : 'text-neutral-500'}`}>
              {DOW[i].slice(0, 1)}
              <br />
              {Number(d.slice(8))}
            </span>
          ))}
          <span className="text-right text-[10.5px] font-bold text-neutral-500">Hrs</span>
        </div>
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-1">
            <div className="h-8 animate-pulse rounded bg-neutral-100" />
            <div className="h-8 animate-pulse rounded bg-neutral-100" />
          </div>
        ) : (
          keys.map((key) => {
            const members = groups.get(key) ?? []
            const open = !collapsed[key]
            const lateCount = members.reduce((s, m) => s + (totals.get(m.id)?.late ?? 0), 0)
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => setCollapsed({ ...collapsed, [key]: open })}
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 border-t border-neutral-100 px-1 pb-1 pt-2 text-left text-[11px] font-extrabold uppercase tracking-wide text-neutral-500 dark:border-neutral-800"
                >
                  <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
                  {key}
                  <span className="ml-auto font-bold normal-case tracking-normal">
                    {members.length} {members.length === 1 ? 'person' : 'people'}
                    {lateCount ? ` · ${lateCount} late` : ''}
                  </span>
                </button>
                {open &&
                  members.map((m) => {
                    const t = totals.get(m.id)
                    const sub = t?.absent ? `${t.absent} absent` : t?.leaveDays ? `${formatDays(t.leaveDays)} d leave` : t?.late ? `${t.late} late` : t?.present ? 'All on time' : '—'
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPersonId(m.id)}
                        className="grid w-full grid-cols-[84px_repeat(7,minmax(0,1fr))_40px] items-center gap-[3px] px-0.5 py-1 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-bold text-neutral-900">{displayName(m.fullName, m.nickname)}</span>
                          <span className={`block truncate text-[10.5px] ${t?.absent ? 'text-status-danger' : t?.late ? 'text-status-warn' : t?.leaveDays ? 'text-brand-600' : 'text-neutral-500'}`}>{sub}</span>
                        </span>
                        {days.map((d, i) => (
                          <DayCell key={d} row={byPerson.get(m.id)?.get(d)} dow={DOW[i]} />
                        ))}
                        <span className="text-right text-[12.5px] font-extrabold text-neutral-900">{hours(t?.workedMinutes ?? 0)}</span>
                      </button>
                    )
                  })}
              </div>
            )
          })
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-100 px-1 pt-2.5 text-[11px] text-neutral-500 dark:border-neutral-800">
          <Legend className="bg-status-working/10" label="On time" />
          <Legend className="border-[1.5px] border-status-warn bg-status-warn/10" label="Late (min)" />
          <Legend className="border-[1.5px] border-status-danger bg-status-danger/10" label="Absent" />
          <Legend className="bg-brand-50" label="Leave" />
          <Legend className="holiday-stripes" label="Holiday" />
        </div>
      </div>
      <p className="px-0.5 text-xs text-neutral-500">Late means clocking in after the person’s own start time plus the grace period. Days off and holidays follow their team’s schedule.</p>

      <BottomSheet open={!!person} onClose={() => setPersonId(null)} title={person ? displayName(person.fullName, person.nickname) : ''}>
        {person && (
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-neutral-500">
              {shortDate(from)} – {shortDate(to)} · {person.departmentName ?? NO_DEPARTMENT}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Worked" value={`${hours(totals.get(person.id)?.workedMinutes ?? 0)} h`} />
              <MiniStat label="Late" value={totals.get(person.id)?.late ? `${totals.get(person.id)!.late} · ${totals.get(person.id)!.lateMinutes} min` : 'None'} />
              <MiniStat label="Leave / absent" value={`${formatDays(totals.get(person.id)?.leaveDays ?? 0)} / ${totals.get(person.id)?.absent ?? 0}`} />
            </div>
            <ul className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700">
              {days.map((d, i) => {
                const r = byPerson.get(person.id)?.get(d)
                return (
                  <li key={d} className="flex items-center gap-3 border-t border-neutral-100 px-3 py-2.5 first:border-t-0 dark:border-neutral-800">
                    <span className="w-14 shrink-0 text-[13px] font-bold text-neutral-900">
                      {DOW[i]} {Number(d.slice(8))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] tabular-nums text-neutral-600">{dayDetail(r)}</span>
                    <StatusTag row={r} />
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

function dayDetail(r: AttendanceDay | undefined): string {
  if (!r) return '—'
  if (r.firstIn) return `${formatTime(r.firstIn)} – ${r.lastOut ? formatTime(r.lastOut) : 'still in'}`
  if (r.status === 'holiday') return r.holidayName ?? 'Public holiday'
  if (r.status === 'leave') return `${r.leaveFraction < 1 ? 'Half day' : 'Full day'}`
  if (r.status === 'off') return 'Day off'
  if (r.status === 'absent') return 'No clock-in, no leave'
  if (r.status === 'upcoming') return r.scheduledStart ? `${r.scheduledStart} – ${r.scheduledEnd}` : ''
  return ''
}

function StatusTag({ row }: { row: AttendanceDay | undefined }) {
  if (!row) return null
  const map: Record<string, [string, string]> = {
    present: ['On time', 'bg-status-working/10 text-status-working dark:text-emerald-300'],
    late: [`${row.lateMinutes} min late`, 'bg-status-warn/10 text-status-warn'],
    absent: ['Absent', 'bg-status-danger/10 text-status-danger'],
    leave: [`${row.leaveType ? row.leaveType[0].toUpperCase() + row.leaveType.slice(1) : ''} leave`, 'bg-brand-50 text-brand-700'],
    holiday: ['Holiday', 'bg-earth-50 text-earth-500'],
    off: ['Off', 'bg-neutral-100 text-neutral-500'],
    upcoming: ['Upcoming', 'bg-neutral-100 text-neutral-500'],
  }
  const [label, cls] = map[row.status]
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${cls}`}>{label}</span>
}

function Kpi({ label, value, sub, tone = 'text-neutral-900', className = '' }: { label: string; value: string; sub: string; tone?: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-card ${className}`}>
      <p className="text-xs font-bold text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="truncate text-xs text-neutral-500">{sub}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-100 px-2.5 py-2">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="text-sm font-extrabold text-neutral-900">{value}</p>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  )
}
