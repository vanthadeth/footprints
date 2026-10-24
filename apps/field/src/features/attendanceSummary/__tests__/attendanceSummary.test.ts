import { describe, expect, it } from 'vitest'
import { formatRate, teamKpis, totalsByPerson, totalsCsv, type AttendanceDay, type DayStatus } from '../attendanceSummary'

function day(userId: string, d: string, status: DayStatus, extra: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    userId,
    day: d,
    status,
    isWorking: !['holiday', 'off'].includes(status),
    scheduledStart: '08:30',
    scheduledEnd: '17:00',
    lateMinutes: 0,
    workedMinutes: status === 'present' || status === 'late' ? 480 : 0,
    firstIn: null,
    lastOut: null,
    leaveType: null,
    leaveFraction: 0,
    holidayName: null,
    ...extra,
  }
}

const rows: AttendanceDay[] = [
  day('a', '2026-09-21', 'present'),
  day('a', '2026-09-22', 'late', { lateMinutes: 12 }),
  day('a', '2026-09-23', 'absent'),
  day('a', '2026-09-24', 'holiday', { holidayName: 'Constitution Day' }),
  day('a', '2026-09-25', 'leave', { leaveType: 'annual', leaveFraction: 1 }),
  day('a', '2026-09-26', 'off'),
  day('b', '2026-09-21', 'present', { leaveType: 'sick', leaveFraction: 0.5 }),
  day('b', '2026-09-22', 'upcoming'),
]

describe('totalsByPerson', () => {
  it('counts a flexible person\'s day without a clock-in as a day off, not an absence', () => {
    const t = totalsByPerson([day('f', '2026-09-26', 'dayoff'), day('f', '2026-09-27', 'present'), day('f', '2026-09-28', 'leave', { leaveType: 'flex', leaveFraction: 1 })])
    expect(t.get('f')).toMatchObject({ scheduled: 1, absent: 0, leaveDays: 2 })
    expect(t.get('f')!.leaveByType).toEqual({ flex: 2 })
  })

  it('counts present, late, absent, leave and holidays per person', () => {
    const t = totalsByPerson(rows)
    expect(t.get('a')).toMatchObject({ scheduled: 3, present: 2, late: 1, lateMinutes: 12, absent: 1, leaveDays: 1, holidays: 1, workedMinutes: 960 })
    expect(t.get('a')!.leaveByType).toEqual({ annual: 1 })
    // A half-day leave on a day they also worked counts both.
    expect(t.get('b')).toMatchObject({ scheduled: 1, present: 1, leaveDays: 0.5 })
  })
})

describe('teamKpis', () => {
  it('leaves leave and upcoming days out of the rate', () => {
    const k = teamKpis(totalsByPerson(rows).values())
    expect(k).toMatchObject({ present: 3, scheduled: 4, late: 1, absent: 1, leaveDays: 1.5 })
    expect(formatRate(k.rate)).toBe('75%')
    expect(formatRate(teamKpis([]).rate)).toBe('—')
  })
})

describe('totalsCsv', () => {
  it('writes one quoted-when-needed line per person', () => {
    const t = totalsByPerson(rows)
    const csv = totalsCsv([{ name: 'Kim, Sina', totals: t.get('a')! }])
    expect(csv.split('\n')[0]).toBe('Name,Present,Late,Late minutes,Absent,Annual,Sick,Unpaid,Holidays,Hours worked')
    expect(csv.split('\n')[1]).toBe('"Kim, Sina",2,1,12,1,1,0,0,1,16.0')
  })
})
