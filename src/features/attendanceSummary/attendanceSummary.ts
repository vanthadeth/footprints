import type { LeaveType } from '@/features/leave/types'

export type DayStatus = 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'off' | 'upcoming'

/** One person on one date, as returned by the attendance_days RPC (0091). */
export interface AttendanceDay {
  userId: string
  day: string
  status: DayStatus
  isWorking: boolean
  scheduledStart: string | null
  scheduledEnd: string | null
  lateMinutes: number
  workedMinutes: number
  firstIn: string | null
  lastOut: string | null
  leaveType: LeaveType | null
  leaveFraction: number
  holidayName: string | null
}

export interface PersonTotals {
  userId: string
  /** Working days so far that count for attendance: present + late + absent (leave and upcoming days don't). */
  scheduled: number
  present: number
  late: number
  lateMinutes: number
  absent: number
  leaveDays: number
  leaveByType: Partial<Record<LeaveType, number>>
  holidays: number
  workedMinutes: number
}

export function emptyTotals(userId: string): PersonTotals {
  return { userId, scheduled: 0, present: 0, late: 0, lateMinutes: 0, absent: 0, leaveDays: 0, leaveByType: {}, holidays: 0, workedMinutes: 0 }
}

/** Per-person totals over whatever rows are passed in (a week, a cycle). */
export function totalsByPerson(rows: AttendanceDay[]): Map<string, PersonTotals> {
  const out = new Map<string, PersonTotals>()
  for (const r of rows) {
    const t = out.get(r.userId) ?? emptyTotals(r.userId)
    if (r.status === 'present' || r.status === 'late') {
      t.present++
      t.scheduled++
    }
    if (r.status === 'late') {
      t.late++
      t.lateMinutes += r.lateMinutes
    }
    if (r.status === 'absent') {
      t.absent++
      t.scheduled++
    }
    if (r.status === 'holiday') t.holidays++
    if (r.leaveFraction > 0 && r.leaveType) {
      t.leaveDays += r.leaveFraction
      t.leaveByType[r.leaveType] = (t.leaveByType[r.leaveType] ?? 0) + r.leaveFraction
    }
    t.workedMinutes += r.workedMinutes
    out.set(r.userId, t)
  }
  return out
}

export interface TeamKpis {
  /** 0–1, or null when nothing was scheduled yet. */
  rate: number | null
  present: number
  scheduled: number
  late: number
  lateMinutes: number
  absent: number
  leaveDays: number
  workedMinutes: number
}

export function teamKpis(totals: Iterable<PersonTotals>): TeamKpis {
  const k: TeamKpis = { rate: null, present: 0, scheduled: 0, late: 0, lateMinutes: 0, absent: 0, leaveDays: 0, workedMinutes: 0 }
  for (const t of totals) {
    k.present += t.present
    k.scheduled += t.scheduled
    k.late += t.late
    k.lateMinutes += t.lateMinutes
    k.absent += t.absent
    k.leaveDays += t.leaveDays
    k.workedMinutes += t.workedMinutes
  }
  k.rate = k.scheduled > 0 ? k.present / k.scheduled : null
  return k
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

/** "12.5" / "3" -- half days keep their decimal. */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Working days in a set of rows for one person (the cycle length shown in the header). */
export function workingDayCount(rows: AttendanceDay[]): number {
  return rows.filter((r) => r.isWorking).length
}

/** CSV for the monthly export: one line per person. */
export function totalsCsv(rows: { name: string; totals: PersonTotals }[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [['Name', 'Present', 'Late', 'Late minutes', 'Absent', 'Annual', 'Sick', 'Unpaid', 'Holidays', 'Hours worked'].join(',')]
  for (const { name, totals: t } of rows) {
    lines.push(
      [
        esc(name),
        t.present,
        t.late,
        t.lateMinutes,
        t.absent,
        formatDays(t.leaveByType.annual ?? 0),
        formatDays(t.leaveByType.sick ?? 0),
        formatDays(t.leaveByType.unpaid ?? 0),
        t.holidays,
        (t.workedMinutes / 60).toFixed(1),
      ].join(',')
    )
  }
  return lines.join('\n')
}
