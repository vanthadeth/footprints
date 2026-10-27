import { describe, expect, it } from 'vitest'
import { dailyEquivalent, monthBounds, personTargets, resolveMonthly, workingDaysOf } from '../orderTargets'

const row = (userId: string, day: string, status: string) => ({ userId, day, status })

describe('monthBounds', () => {
  it('gives the first and last day of the month, leap years and short months included', () => {
    expect(monthBounds('2026-10-27')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthBounds('2026-02-03')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthBounds('2028-02-29')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthBounds('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('resolveMonthly', () => {
  it("uses the person's own target, else the company's", () => {
    expect(resolveMonthly(8000, true, 6000)).toBe(8000)
    expect(resolveMonthly(null, true, 6000)).toBe(6000)
  })
  it('is null when switched off, whatever the targets are', () => {
    expect(resolveMonthly(8000, false, 6000)).toBeNull()
    expect(resolveMonthly(null, false, 6000)).toBeNull()
  })
  it('is null when no target is above zero, and 0 on the person means none', () => {
    expect(resolveMonthly(null, true, 0)).toBeNull()
    expect(resolveMonthly(0, true, 6000)).toBeNull()
  })
})

describe('workingDaysOf and dailyEquivalent', () => {
  const rows = [
    row('a', '2026-10-19', 'present'), row('a', '2026-10-20', 'late'), row('a', '2026-10-21', 'absent'), row('a', '2026-10-22', 'upcoming'),
    row('a', '2026-10-23', 'leave'), row('a', '2026-10-24', 'off'), row('a', '2026-10-25', 'holiday'), row('a', '2026-10-26', 'dayoff'),
    row('b', '2026-10-19', 'present'),
  ]
  it("counts a person's working days: leave, holidays, days off and unscheduled days do not count", () => {
    expect(workingDaysOf(rows, 'a')).toBe(4)
    expect(workingDaysOf(rows, 'b')).toBe(1)
    expect(workingDaysOf(rows, 'nobody')).toBe(0)
  })
  it("divides the monthly target by the person's working days: $6,600 over 22 days is $300 a day", () => {
    expect(dailyEquivalent(6600, 22)).toBe(300)
    expect(dailyEquivalent(8000, 4)).toBe(2000)
  })
  it('uses a standard 22-day month when the days are not known, and is 0 without a target', () => {
    expect(dailyEquivalent(6600, 0)).toBe(300)
    expect(dailyEquivalent(null, 22)).toBe(0)
    expect(dailyEquivalent(0, 22)).toBe(0)
  })
})

describe('personTargets', () => {
  it('resolves everyone: own target, company default, switched off, and no target at all', () => {
    const month = [row('a', '2026-10-19', 'present'), row('a', '2026-10-20', 'present'), row('b', '2026-10-19', 'present'), row('c', '2026-10-19', 'present')]
    const t = personTargets(
      [
        { userId: 'a', monthly: 4000, required: true },
        { userId: 'b', monthly: null, required: true },
        { userId: 'c', monthly: 9000, required: false },
        { userId: 'd', monthly: null, required: true },
      ],
      1000,
      month
    )
    expect(t.a).toEqual({ monthly: 4000, daily: 2000, required: true })
    expect(t.b).toEqual({ monthly: 1000, daily: 1000, required: true })
    expect(t.c).toEqual({ monthly: null, daily: 0, required: false })
    // d has no rows: a standard month
    expect(t.d).toEqual({ monthly: 1000, daily: 1000 / 22, required: true })
  })
  it('has no targets for anyone while the company has none and nobody has their own', () => {
    expect(personTargets([{ userId: 'a', monthly: null, required: true }], 0, []).a).toEqual({ monthly: null, daily: 0, required: true })
  })
})
