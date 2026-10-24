import { displayName } from '@footprints/shared/lib/displayName'
import type { AttendanceRecord, LeaveCode } from '@footprints/shared/components/attendance'
import type { RosterData, RosterPerson } from '@footprints/shared/components/roster'
import type { TeamMember } from '@/features/fleet/types'
import type { LeaveType } from '@/features/leave/types'
import type { AttendanceDay } from './attendanceSummary'

const LEAVE_CODE: Record<LeaveType, LeaveCode> = { annual: 'AL', unpaid: 'UL', sick: 'SL', flex: 'FD' }

export const NO_DEPARTMENT = 'No department'

/**
 * One attendance_days row as the roster's record, or null when there is nothing to show yet (an upcoming day).
 * The server lets a clock-in win over leave, so a clocked-in day with part-day leave comes back present or late with a leave fraction:
 * that becomes `halfLeave`. A day of leave with no clock-in is `leave`, half when the fraction is under 1.
 */
export function recordFor(row: AttendanceDay): AttendanceRecord | null {
  const code = row.leaveType ? LEAVE_CODE[row.leaveType] : undefined
  const partDay = row.leaveFraction > 0 && row.leaveFraction < 1
  switch (row.status) {
    case 'present':
      return partDay && code ? { result: 'present', halfLeave: code } : { result: 'present' }
    case 'late':
      return { result: 'late', minutes: row.lateMinutes, ...(partDay && code ? { halfLeave: code } : {}) }
    case 'leave':
      return { result: 'leave', code: code ?? 'AL', half: partDay }
    case 'absent':
      return { result: 'absent' }
    case 'dayoff':
      return { result: 'dayoff' }
    case 'holiday':
      return { result: 'holiday' }
    case 'off':
      return { result: 'off' }
    case 'upcoming':
      return null
  }
}

/** Department then name, with people who have no department last. The roster groups in order of first appearance, so this order is the page's order. */
function byDepartmentThenName(a: RosterPerson, b: RosterPerson): number {
  if ((a.department === NO_DEPARTMENT) !== (b.department === NO_DEPARTMENT)) return a.department === NO_DEPARTMENT ? 1 : -1
  return a.department.localeCompare(b.department) || a.name.localeCompare(b.name)
}

/**
 * The roster's data from `my_team()` and `attendance_days` rows. Rows for people who are not in `team` are dropped.
 * Day keys are the rows' own date strings (Phnom Penh calendar days); `today` must be the app's `todayDateString()`, not the browser's date.
 */
export function toRosterData(team: TeamMember[], rows: AttendanceDay[], today: string): RosterData {
  const people = team
    .map((m): RosterPerson => ({ id: m.id, name: displayName(m.fullName, m.nickname), department: m.departmentName?.trim() || NO_DEPARTMENT }))
    .sort(byDepartmentThenName)
  const known = new Set(people.map((p) => p.id))
  const records: RosterData['records'] = {}
  for (const row of rows) {
    if (!known.has(row.userId)) continue
    const rec = recordFor(row)
    if (rec) (records[row.userId] ??= {})[row.day] = rec
  }
  return { today, people, records }
}
