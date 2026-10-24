import { describe, expect, it } from 'vitest'
import { addDays, cycleFor, cycleLabel, cycleRule, datesBetween, weekStart } from '../attendanceCycle'

describe('cycleFor', () => {
  it('closing on the 20th counts the 21st of last month to the 20th', () => {
    expect(cycleFor(20, '2026-09-27')).toEqual({ start: '2026-09-21', end: '2026-10-20' })
    expect(cycleFor(20, '2026-09-27', -1)).toEqual({ start: '2026-08-21', end: '2026-09-20' })
    expect(cycleFor(20, '2026-09-20')).toEqual({ start: '2026-08-21', end: '2026-09-20' })
  })

  it('handles calendar months, a New Year crossing and a short February', () => {
    expect(cycleFor(0, '2026-09-27')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(cycleFor(0, '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(cycleFor(25, '2026-01-10')).toEqual({ start: '2025-12-26', end: '2026-01-25' })
    // Closing on the 28th: the March cycle starts on 1 Mar, not a non-existent 29 Feb.
    expect(cycleFor(28, '2026-03-15')).toEqual({ start: '2026-03-01', end: '2026-03-28' })
  })

  it('labels and describes cycles', () => {
    expect(cycleLabel({ start: '2026-08-21', end: '2026-09-20' })).toBe('21 Aug – 20 Sep 2026')
    expect(cycleLabel({ start: '2025-12-26', end: '2026-01-25' })).toBe('26 Dec 2025 – 25 Jan 2026')
    expect(cycleRule(20)).toBe('Closes on the 20th · counts the 21st to the 20th')
    expect(cycleRule(0)).toBe('Calendar month · closes on the last day')
  })
})

describe('dates', () => {
  it('lists every date and finds the week start', () => {
    expect(datesBetween('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(weekStart('2026-09-27')).toBe('2026-09-21')
    expect(weekStart('2026-09-21')).toBe('2026-09-21')
    expect(weekStart('2026-09-27', -1)).toBe('2026-09-14')
    expect(addDays('2026-09-21', 6)).toBe('2026-09-27')
  })
})
