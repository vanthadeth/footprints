import type { LeaveRequest, LeaveType } from './types'

export type AttendanceCellKind = 'present' | 'leave' | 'weekend' | 'future' | 'none'

export interface AttendanceCell {
  /** "YYYY-MM-DD" */
  date: string
  day: number
  kind: AttendanceCellKind
  leaveType?: LeaveType
  /** True when only half the day is leave (a morning/afternoon request). */
  half?: boolean
  /** Present on a day that was also half-day leave. */
  alsoPresent?: boolean
  isToday: boolean
}

export interface AttendanceMonth {
  /** Monday-first grid rows; null pads the days before the 1st / after the last. */
  weeks: (AttendanceCell | null)[][]
  presentDays: number
  leaveDays: Record<LeaveType, number>
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * One month of a person's attendance, day by day: Present when they
 * clocked in that day, otherwise the leave type of any approved request
 * covering it (half-day requests count 0.5 on their first/last day).
 * Sundays are the only non-working day; days after `today` are "future".
 * Pure so the calendar maths is testable without a database.
 */
export function buildAttendanceMonth(
  year: number,
  month: number, // 1-12
  presentDates: Set<string>,
  requests: LeaveRequest[],
  today: string
): AttendanceMonth {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7 // Mon=0
  const approved = requests.filter((r) => r.status === 'approved')

  const leaveDays: Record<LeaveType, number> = { annual: 0, sick: 0, unpaid: 0 }
  let presentDays = 0
  const cells: (AttendanceCell | null)[] = Array.from({ length: firstWeekday }, () => null)

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`
    const sunday = new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0
    const present = presentDates.has(date)
    const req = approved.find((r) => r.start_date <= date && date <= r.end_date)
    let half = false
    if (req) {
      if (date === req.start_date && req.start_period !== 'full') half = true
      if (date === req.end_date && req.end_period !== 'full') half = true
    }

    let cell: AttendanceCell
    if (req && !sunday) {
      leaveDays[req.leave_type] += half ? 0.5 : 1
      if (present) presentDays += half ? 0.5 : 0
      cell = { date, day: d, kind: 'leave', leaveType: req.leave_type, half, alsoPresent: present, isToday: date === today }
    } else if (present) {
      presentDays += 1
      cell = { date, day: d, kind: 'present', isToday: date === today }
    } else if (sunday) {
      cell = { date, day: d, kind: 'weekend', isToday: date === today }
    } else if (date > today) {
      cell = { date, day: d, kind: 'future', isToday: false }
    } else {
      cell = { date, day: d, kind: 'none', isToday: date === today }
    }
    cells.push(cell)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (AttendanceCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return { weeks, presentDays, leaveDays }
}
