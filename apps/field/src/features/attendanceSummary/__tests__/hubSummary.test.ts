import { describe, expect, it } from 'vitest'
import type { TeamMember } from '@/features/fleet/types'
import type { AttendanceDay, DayStatus } from '../attendanceSummary'
import { buildHubSummary } from '../hubSummary'

const member = (id: string, fullName: string): TeamMember => ({ id, fullName, nickname: null, photoPath: null, position: null, roleName: null, managerId: null, isFieldSales: false, departmentId: null, departmentName: 'Office' })
const TEAM = [member('a', 'Ann'), member('b', 'Bob'), member('c', 'Cara')]
const row = (userId: string, day: string, status: DayStatus, extra: Partial<AttendanceDay> = {}): AttendanceDay => ({
  userId, day, status, isWorking: true, scheduledStart: '08:00', scheduledEnd: '17:00', lateMinutes: 0, workedMinutes: 480, firstIn: null, lastOut: null, leaveType: null, leaveFraction: 0, holidayName: null, ...extra,
})
const DAYS = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
const TODAY = '2026-10-21'

// Mon: all in. Tue: Ann late 20, Bob absent. Wed (today): Cara on annual leave, Ann late 5, Bob not in yet.
const ROWS = [
  row('a', DAYS[0], 'present'), row('b', DAYS[0], 'present'), row('c', DAYS[0], 'present'),
  row('a', DAYS[1], 'late', { lateMinutes: 20, firstIn: '2026-10-20T01:20:00Z' }), row('b', DAYS[1], 'absent'), row('c', DAYS[1], 'present'),
  row('a', DAYS[2], 'late', { lateMinutes: 5, firstIn: '2026-10-21T01:05:00Z' }), row('b', DAYS[2], 'upcoming'), row('c', DAYS[2], 'leave', { leaveType: 'annual', leaveFraction: 1 }),
  row('a', DAYS[5], 'off', { isWorking: false }), row('a', DAYS[6], 'off', { isWorking: false }),
]

describe('buildHubSummary', () => {
  const s = buildHubSummary(ROWS, TEAM, DAYS, TODAY, '10:00')

  it('totals the week with the Weekly attendance rules (leave excluded from the rate)', () => {
    expect(s.late).toBe(2)
    expect(s.lateMinutes).toBe(25)
    expect(s.absent).toBe(1)
    expect(s.leaveDays).toBe(1)
    expect(s.present).toBe(6) // Mon 3 + Tue Ann(late) and Cara + Wed Ann(late)
    expect(s.scheduled).toBe(7) // present + absent
    expect(s.rate).toBeCloseTo(6 / 7, 5)
  })

  it('counts late, absent and leave per day, and marks days nobody was scheduled', () => {
    expect(s.perDay.map((d) => [d.late, d.absent, d.leave, d.scheduled])).toEqual([
      [0, 0, 0, true],
      [1, 1, 0, true],
      [1, 0, 1, true],
      [0, 0, 0, false],
      [0, 0, 0, false],
      [0, 0, 0, false],
      [0, 0, 0, false],
    ])
  })

  it("lists today's people to look at, most urgent first", () => {
    expect(s.todayItems.map((i) => [i.name, i.kind])).toEqual([['Bob', 'notin'], ['Ann', 'late'], ['Cara', 'leave']])
  })

  it('counts a flexible day off as leave on its day', () => {
    const r = buildHubSummary([row('a', DAYS[0], 'dayoff'), row('b', DAYS[0], 'present')], TEAM, DAYS, TODAY, '10:00')
    expect(r.perDay[0].leave).toBe(1)
  })

  it('has no rate and no people to look at in an empty week, and ignores people outside the team', () => {
    const empty = buildHubSummary([], TEAM, DAYS, TODAY, '10:00')
    expect(empty.rate).toBeNull()
    expect(empty.todayItems).toEqual([])
    const other = buildHubSummary([row('zzz', DAYS[0], 'absent')], TEAM, DAYS, TODAY, '10:00')
    expect(other.absent).toBe(0)
  })
})
