import { describe, expect, it } from 'vitest'
import type { TeamMember } from '@/features/fleet/types'
import { buildDayDetails } from '../attendanceDetails'
import type { AttendanceDay, DayStatus } from '../attendanceSummary'

const member = (id: string, fullName: string): TeamMember => ({ id, fullName, nickname: null, photoPath: null, position: null, roleName: null, managerId: null, isFieldSales: true, departmentId: null, departmentName: 'Sales' })
const TEAM = [member('a', 'Ann'), member('b', 'Bob'), member('c', 'Cara')]
const row = (userId: string, day: string, status: DayStatus, extra: Partial<AttendanceDay> = {}): AttendanceDay => ({
  userId, day, status, isWorking: true, scheduledStart: '08:00', scheduledEnd: '17:00', lateMinutes: 0, workedMinutes: 0, firstIn: null, lastOut: null, leaveType: null, leaveFraction: 0, holidayName: null, ...extra,
})
const DAYS = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']

describe('buildDayDetails', () => {
  it('lists days newest first and skips weekends and days still to come', () => {
    const rows = [
      row('a', '2026-10-19', 'present'),
      row('a', '2026-10-20', 'present'),
      row('a', '2026-10-21', 'upcoming'),
      row('a', '2026-10-24', 'off', { isWorking: false }),
    ]
    const d = buildDayDetails(rows, TEAM, DAYS, '2026-10-20', '09:00')
    expect(d.map((x) => x.day)).toEqual(['2026-10-20', '2026-10-19'])
  })

  it('puts absent first, then late by minutes, then leave, and counts on time', () => {
    const rows = [
      row('a', '2026-10-19', 'late', { lateMinutes: 5, firstIn: '2026-10-19T01:05:00Z' }),
      row('b', '2026-10-19', 'late', { lateMinutes: 25, firstIn: '2026-10-19T01:25:00Z' }),
      row('c', '2026-10-19', 'absent'),
    ]
    const d = buildDayDetails(rows, TEAM, DAYS, '2026-10-22', '09:00')[0]
    expect(d.items.map((i) => [i.name, i.kind])).toEqual([['Cara', 'absent'], ['Bob', 'late'], ['Ann', 'late']])
    expect(d.counts).toMatchObject({ absent: 1, late: 2, leave: 0 })
    expect(d.onTime).toEqual([])
  })

  it('keeps half-day leave as leave with its fraction, and counts a present half-day person as on time', () => {
    const rows = [row('a', '2026-10-19', 'leave', { leaveType: 'annual', leaveFraction: 0.5 }), row('b', '2026-10-19', 'present', { leaveFraction: 0.5 })]
    const d = buildDayDetails(rows, TEAM, DAYS, '2026-10-22', '09:00')[0]
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ kind: 'leave', leaveType: 'annual', leaveFraction: 0.5 })
    expect(d.onTime.map((p) => p.userId)).toEqual(['b'])
  })

  it("shows today's people who should have clocked in as not in yet, but not before their start", () => {
    const rows = [row('a', '2026-10-20', 'upcoming'), row('b', '2026-10-20', 'upcoming', { scheduledStart: '13:00' }), row('c', '2026-10-20', 'present')]
    const d = buildDayDetails(rows, TEAM, DAYS, '2026-10-20', '09:30')[0]
    expect(d.items.map((i) => [i.name, i.kind])).toEqual([['Ann', 'notin']])
    expect(d.onTime.map((p) => p.userId)).toEqual(['c'])
  })

  it("never calls a past day's no-shows 'not in yet'", () => {
    const d = buildDayDetails([row('a', '2026-10-19', 'absent')], TEAM, DAYS, '2026-10-22', '09:00')[0]
    expect(d.items[0].kind).toBe('absent')
  })

  it('keeps one line for a public holiday and ignores people outside the team', () => {
    const rows = [row('a', '2026-10-19', 'holiday', { isWorking: false, holidayName: 'Independence Day' }), row('zzz', '2026-10-19', 'absent')]
    const d = buildDayDetails(rows, TEAM, DAYS, '2026-10-22', '09:00')
    expect(d).toHaveLength(1)
    expect(d[0].holiday).toBe('Independence Day')
    expect(d[0].items).toHaveLength(0)
  })
})
