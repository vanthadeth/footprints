import { describe, expect, it } from 'vitest'
import { NO_DEPARTMENT, recordFor, toRosterData } from '../rosterAdapter'
import type { AttendanceDay } from '../attendanceSummary'
import type { TeamMember } from '@/features/fleet/types'

const row = (over: Partial<AttendanceDay> = {}): AttendanceDay => ({
  userId: 'u1', day: '2026-10-12', status: 'present', isWorking: true, scheduledStart: '08:30', scheduledEnd: '17:00',
  lateMinutes: 0, workedMinutes: 0, firstIn: null, lastOut: null, leaveType: null, leaveFraction: 0, holidayName: null, ...over,
})
const member = (id: string, fullName: string, departmentName: string | null, nickname: string | null = null): TeamMember => ({
  id, fullName, nickname, photoPath: null, position: null, roleName: null, managerId: null, isFieldSales: false, departmentId: null, departmentName,
})

describe('recordFor', () => {
  it('maps present, late with its minutes, absent, day off, holiday and not scheduled', () => {
    expect(recordFor(row())).toEqual({ result: 'present' })
    expect(recordFor(row({ status: 'late', lateMinutes: 18 }))).toEqual({ result: 'late', minutes: 18 })
    expect(recordFor(row({ status: 'absent' }))).toEqual({ result: 'absent' })
    expect(recordFor(row({ status: 'dayoff' }))).toEqual({ result: 'dayoff' })
    expect(recordFor(row({ status: 'holiday', holidayName: 'Pchum Ben' }))).toEqual({ result: 'holiday' })
    expect(recordFor(row({ status: 'off' }))).toEqual({ result: 'off' })
  })
  it('has nothing to show for an upcoming day', () => {
    expect(recordFor(row({ status: 'upcoming' }))).toBeNull()
  })
  it('maps each leave type to its code, and half-day leave to the half flag', () => {
    const leave = (leaveType: AttendanceDay['leaveType'], leaveFraction: number) => recordFor(row({ status: 'leave', leaveType, leaveFraction }))
    expect(leave('annual', 1)).toEqual({ result: 'leave', code: 'AL', half: false })
    expect(leave('unpaid', 1)).toEqual({ result: 'leave', code: 'UL', half: false })
    expect(leave('sick', 1)).toEqual({ result: 'leave', code: 'SL', half: false })
    expect(leave('flex', 1)).toEqual({ result: 'leave', code: 'FD', half: false })
    expect(leave('annual', 0.5)).toEqual({ result: 'leave', code: 'AL', half: true })
  })
  it('keeps part-day leave next to a clock-in, but not a full day of leave that was also worked', () => {
    expect(recordFor(row({ status: 'present', leaveType: 'sick', leaveFraction: 0.5 }))).toEqual({ result: 'present', halfLeave: 'SL' })
    expect(recordFor(row({ status: 'late', lateMinutes: 12, leaveType: 'annual', leaveFraction: 0.5 }))).toEqual({ result: 'late', minutes: 12, halfLeave: 'AL' })
    expect(recordFor(row({ status: 'present', leaveType: 'annual', leaveFraction: 1 }))).toEqual({ result: 'present' })
  })
})

describe('toRosterData', () => {
  const team = [member('b', 'Chan Sreyneang', 'Sales'), member('a', 'Sok Dara', 'Sales', 'Dara'), member('c', 'Kim Lyna', null), member('d', 'Ly Bunna', 'Distribution')]
  it('lists people by department then name, with no department last, using the display name', () => {
    const d = toRosterData(team, [], '2026-10-23')
    expect(d.people.map((p) => [p.department, p.name])).toEqual([
      ['Distribution', 'Ly Bunna'],
      ['Sales', 'Chan Sreyneang'],
      ['Sales', 'Dara'],
      [NO_DEPARTMENT, 'Kim Lyna'],
    ])
  })
  it('keys records by person and day, drops upcoming days and people who are not in the team, and passes today through', () => {
    const rows = [
      row({ userId: 'a', day: '2026-10-12', status: 'present' }),
      row({ userId: 'a', day: '2026-10-13', status: 'late', lateMinutes: 9 }),
      row({ userId: 'a', day: '2026-10-24', status: 'upcoming' }),
      row({ userId: 'zzz', day: '2026-10-12', status: 'present' }),
    ]
    const d = toRosterData(team, rows, '2026-10-23')
    expect(d.today).toBe('2026-10-23')
    expect(d.records).toEqual({ a: { '2026-10-12': { result: 'present' }, '2026-10-13': { result: 'late', minutes: 9 } } })
  })
})
