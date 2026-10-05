import { useMemo, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import type { TeamMember } from '@/features/fleet/types'
import { LEAVE_TYPE_LABEL } from '@/features/leave/types'
import { displayName } from '@/lib/displayName'
import { formatDuration, formatTime } from '@/lib/datetime'
import { todayDateString } from '@/lib/dateRange'
import { useAttendanceDays } from './useAttendanceDays'
import type { AttendanceDay } from './attendanceSummary'

type Group = 'ontime' | 'late' | 'notin' | 'leave'
const GROUPS: [Group, string, string][] = [
  ['ontime', 'On time', 'bg-status-working'],
  ['late', 'Late', 'bg-status-warn'],
  ['notin', 'Not in', 'bg-status-danger'],
  ['leave', 'Leave', 'bg-neutral-400'],
]
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function groupOf(d: AttendanceDay | undefined, isToday: boolean): Group | null {
  if (!d) return null
  if (d.status === 'leave') return 'leave'
  if (d.status === 'late') return 'late'
  if (d.status === 'present') return 'ontime'
  if (d.status === 'absent' || (isToday && d.isWorking && !d.firstIn)) return 'notin'
  return null
}

/**
 * Team report › Attendance › Day (canvas Polish › Team report ›
 * Attendance): the day's counts (on time, late, not in, leave) and one row
 * per person on the shift's time line -- when they clocked in and out,
 * how late, hours worked. The clock-in photos stay one tap away.
 */
export function DailyAttendance({ team, onShowPhotos }: { team: TeamMember[]; onShowPhotos: () => void }) {
  const today = todayDateString()
  const [day, setDay] = useState(today)
  const ids = useMemo(() => team.map((m) => m.id), [team])
  const { rows, loading, error } = useAttendanceDays(day, day, ids)
  const [only, setOnly] = useState<Group | null>(null)
  const isToday = day === today
  const byUser = new Map(rows.map((r) => [r.userId, r]))
  const counts = Object.fromEntries(GROUPS.map(([g]) => [g, team.filter((m) => groupOf(byUser.get(m.id), isToday) === g).length])) as Record<Group, number>

  const starts = rows.map((r) => r.scheduledStart).filter((x): x is string => !!x)
  const ends = rows.map((r) => r.scheduledEnd).filter((x): x is string => !!x)
  const shiftStart = starts.sort()[0] ?? '08:00'
  const shiftEnd = ends.sort().reverse()[0] ?? '17:00'
  const from = toMin(shiftStart) - 60
  const to = toMin(shiftEnd) + 60
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - from) / (to - from)) * 100)).toFixed(2)}%`
  const localMin = (iso: string) => toMin(formatTime(iso))
  const nowMin = toMin(formatTime(new Date().toISOString()))

  const departments = [...new Set(team.map((m) => m.departmentName ?? 'No department'))].sort()
  const title = isToday ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const sub = isToday ? `${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · now ${formatTime(new Date().toISOString())}` : `Shift ${shiftStart} – ${shiftEnd}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-neutral-100 bg-white px-2 py-2 shadow-card">
        <button type="button" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-900">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[15px] font-bold text-neutral-900">{title}</p>
          <p className="text-xs text-neutral-500">{sub}</p>
        </div>
        <button type="button" disabled={isToday} onClick={() => setDay(addDays(day, 1))} aria-label="Next day" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-900 disabled:opacity-30">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {GROUPS.map(([g, label, dot]) => {
          const on = only === g
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              onClick={() => setOnly(on ? null : g)}
              className={`rounded-2xl border px-2 py-2.5 text-left ${on ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-100'} bg-white shadow-card`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                {label}
              </span>
              <span className="mt-0.5 block text-[22px] font-extrabold leading-7 text-neutral-900">{counts[g]}</span>
            </button>
          )
        })}
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <section aria-label="Clock-in" className="rounded-2xl border border-neutral-100 bg-white px-3.5 pb-2 pt-3 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{isToday ? 'Clock-in today' : 'Clock-in'}</p>
          <p className="text-xs text-neutral-500">
            Shift {shiftStart} – {shiftEnd}
          </p>
        </div>
        <div aria-hidden className="relative ml-[40%] mt-2 h-4 text-[10px] text-neutral-500">
          {[shiftStart, `${String(Math.round((toMin(shiftStart) + toMin(shiftEnd)) / 120)).padStart(2, '0')}:00`, shiftEnd].map((label, i) => (
            <span key={label + i} className="absolute -translate-x-1/2" style={{ left: pct(toMin(label)) }}>
              {label}
            </span>
          ))}
        </div>
        {loading && rows.length === 0 && <div className="my-2 h-24 animate-pulse rounded-xl bg-neutral-100" />}
        {departments.map((dept) => {
          const members = team.filter((m) => (m.departmentName ?? 'No department') === dept && (!only || groupOf(byUser.get(m.id), isToday) === only))
          if (members.length === 0) return null
          return (
            <div key={dept}>
              <p className="border-t border-neutral-100 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">{dept}</p>
              {members.map((m) => {
                const d = byUser.get(m.id)
                const g = groupOf(d, isToday)
                const name = displayName(m.fullName, m.nickname)
                const inMin = d?.firstIn ? localMin(d.firstIn) : null
                const outMin = d?.lastOut ? localMin(d.lastOut) : isToday && inMin != null ? nowMin : null
                const sub =
                  g === 'leave'
                    ? `${d?.leaveType ? LEAVE_TYPE_LABEL[d.leaveType] : 'Leave'}${d && d.leaveFraction < 1 ? ' · half day' : ''}`
                    : g === 'notin'
                      ? 'Not clocked in'
                      : g === 'late'
                        ? `${d!.lateMinutes} min late`
                        : g === 'ontime'
                          ? 'On time'
                          : d?.holidayName ?? (d?.status === 'dayoff' || d?.status === 'off' ? 'Day off' : '—')
                return (
                  <div key={m.id} className="flex items-center gap-2.5 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{name.slice(0, 2).toUpperCase()}</span>
                    <span className="w-[calc(40%-42px)] min-w-0 shrink-0">
                      <span className="block truncate text-[13px] font-bold text-neutral-900">{name}</span>
                      <span className={`block truncate text-[11px] ${g === 'late' ? 'font-semibold text-status-warn' : g === 'notin' ? 'font-semibold text-status-danger' : 'text-neutral-500'}`}>{sub}</span>
                    </span>
                    <span className="relative h-5 flex-1 rounded-md bg-neutral-100" role="img" aria-label={inMin != null ? `In ${formatTime(d!.firstIn!)}${d?.lastOut ? `, out ${formatTime(d.lastOut)}` : ''}` : sub}>
                      <span className="absolute inset-y-0 border-x border-dashed border-neutral-300 dark:border-neutral-600" style={{ left: pct(toMin(shiftStart)), right: `calc(100% - ${pct(toMin(shiftEnd))})` }} />
                      {inMin != null && outMin != null && (
                        <span
                          className={`absolute inset-y-1 rounded ${g === 'late' ? 'bg-status-warn' : 'bg-status-working'}`}
                          style={{ left: pct(inMin), width: `max(3px, calc(${pct(outMin)} - ${pct(inMin)}))` }}
                        />
                      )}
                      {g === 'leave' && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-neutral-500">Leave</span>}
                    </span>
                    <span className="w-12 shrink-0 text-right">
                      <span className="block text-[13px] font-extrabold text-neutral-900">{d && d.workedMinutes ? formatDuration(d.workedMinutes * 60_000, 'en') : '—'}</span>
                      {inMin != null && <span className="block text-[10px] text-neutral-500">in {formatTime(d!.firstIn!)}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </section>
      <p className="px-0.5 text-xs text-neutral-500">Late means clocking in after the person’s own start time plus the grace period. Days off and holidays follow their team’s schedule.</p>
      <button type="button" onClick={onShowPhotos} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-[13px] font-bold text-brand-500">
        <Camera className="h-4 w-4" aria-hidden /> Clock-in photos and places
      </button>
    </div>
  )
}
