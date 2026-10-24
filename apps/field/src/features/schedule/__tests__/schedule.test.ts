import { describe, expect, it } from 'vitest'
import { commonHours, dayHours, formatHours, fromMinutes, scheduleProblems, weekFrom, weekHours, workingDaysLabel, type DaySchedule } from '../schedule'

const week = weekFrom('08:30', '17:00', 30)

describe('hours', () => {
  it('subtracts an unpaid break and ignores days off', () => {
    expect(dayHours(week[0], false)).toBe(8)
    expect(dayHours(week[0], true)).toBe(8.5)
    expect(dayHours(week[6], false)).toBe(0)
    expect(weekHours(week, false)).toBe(40)
  })

  it('formats whole and half hours', () => {
    expect(formatHours(8)).toBe('8 h')
    expect(formatHours(3.5)).toBe('3.5 h')
  })

  it('wraps minutes round the clock', () => {
    expect(fromMinutes(8 * 60 + 30 - 60)).toBe('07:30')
    expect(fromMinutes(-30)).toBe('23:30')
  })
})

describe('labels', () => {
  it('names a run, a list, one day or none', () => {
    expect(workingDaysLabel(week)).toBe('Mon – Fri')
    const withSat: DaySchedule[] = week.map((d) => (d.isoDow === 6 ? { ...d, isWorking: true, end: '12:00', breakMinutes: 0 } : d))
    expect(workingDaysLabel(withSat)).toBe('Mon – Sat')
    expect(workingDaysLabel(week.map((d) => ({ ...d, isWorking: [1, 3, 5].includes(d.isoDow) })))).toBe('Mon, Wed, Fri')
    expect(workingDaysLabel(week.map((d) => ({ ...d, isWorking: d.isoDow === 2 })))).toBe('Tuesday')
    expect(workingDaysLabel(week.map((d) => ({ ...d, isWorking: false })))).toBe('No working days')
    expect(commonHours(week)).toEqual({ start: '08:30', end: '17:00' })
    expect(commonHours(withSat)).toBeNull()
  })
})

describe('scheduleProblems', () => {
  it('flags no working days and a day that ends before it starts', () => {
    expect(scheduleProblems(week)).toEqual([])
    expect(scheduleProblems(week.map((d) => ({ ...d, isWorking: false })))).toEqual(['Pick at least one working day.'])
    expect(scheduleProblems(week.map((d) => (d.isoDow === 2 ? { ...d, end: '08:00' } : d)))).toEqual(['Tuesday ends before it starts.'])
  })
})
