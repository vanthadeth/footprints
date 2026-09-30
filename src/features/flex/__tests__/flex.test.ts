import { describe, expect, it } from 'vitest'
import { teamStatus, cellTag, cycleCells, cycleLabel, cycleStatus, dayDate, days, leftAfter, rate, usedRows, type FlexCycle, type FlexDay } from '../flex'

const d = (day: string, kind: FlexDay['kind'], cost = 0, weekday = 1): FlexDay => ({ day, kind, cost, weekday, requestId: null, holidayName: null })
const cycle = (over: Partial<FlexCycle> = {}): FlexCycle => ({
  cycleStart: '2026-09-21', cycleEnd: '2026-10-20', closeDay: 20, isFlexible: true, saturdays: 4, sundays: 4, satRate: 0.5, sunRate: 1,
  allowance: 6, requested: 1, autoDays: 1, taken: 2, planned: 2, left: 2, closed: false, settled: false, settledAt: null,
  unusedDays: 2, overDays: 0, annualDays: null, unpaidDays: null, ...over,
})

describe('flexible days off helpers', () => {
  it('formats days, rates and dates', () => {
    expect(days(6)).toBe('6')
    expect(days(2.5)).toBe('2.5')
    expect(rate(0.5)).toBe('½')
    expect(rate(1)).toBe('1')
    expect(dayDate('2026-10-20')).toBe('Tue 20 Oct')
    expect(cycleLabel(cycle())).toBe('21 Sep – 20 Oct')
  })

  it('reads the cycle status', () => {
    expect(cycleStatus(cycle()).label).toBe('On track')
    expect(cycleStatus(cycle({ left: 1 })).label).toBe('Almost used')
    expect(cycleStatus(cycle({ left: -3 }))).toEqual({ label: 'Over by 3', tone: 'danger' })
    expect(cycleStatus(cycle({ settled: true })).label).toBe('Settled')
  })

  it('pads the grid to Monday and tags each day', () => {
    const cells = cycleCells([d('2026-09-23', 'worked', 0, 3), d('2026-09-24', 'flex', 0.5, 4)])
    expect(cells.slice(0, 2)).toEqual([null, null])
    expect(cellTag(cells[3]!)).toBe('½ Off')
  })

  it('lists the days that use the allowance', () => {
    const rows = usedRows([d('2026-09-25', 'auto', 1, 5), d('2026-09-26', 'worked', 0, 6), d('2026-10-08', 'pend', 1, 4)])
    expect(rows).toEqual([
      { day: 'Fri 25 Sep', note: 'No clock-in', amount: '−1', pending: false },
      { day: 'Thu 8 Oct', note: 'Planned · waiting for approval', amount: '−1', pending: true },
    ])
  })

  it('works out what a request leaves', () => {
    expect(leftAfter(cycle(), 2)).toBe(0)
    expect(leftAfter(cycle(), 5)).toBe(-3)
  })

  it('reads a team row status', () => {
    expect(teamStatus({ isFlexible: false, nextFrom: '2026-10-21', settled: false, left: 0 }).label).toBe('Starts 21 Oct')
    expect(teamStatus({ isFlexible: true, nextFrom: null, settled: false, left: -1.5 })).toEqual({ label: 'Over by 1.5', tone: 'danger' })
    expect(teamStatus({ isFlexible: true, nextFrom: null, settled: true, left: 2 }).label).toBe('Settled')
    expect(teamStatus({ isFlexible: true, nextFrom: null, settled: false, left: 4 }).label).toBe('On track')
  })
})
