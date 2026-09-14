import { describe, expect, it, vi, afterEach } from 'vitest'
import { getCustomRange, getPresetRange, lastNDaysEnding, todayDateString } from '../dateRange'

describe('getCustomRange', () => {
  it('converts a Phnom Penh calendar date to the correct UTC instant (UTC+7, no DST)', () => {
    const range = getCustomRange('2026-01-15', '2026-01-15', 'Asia/Phnom_Penh')
    expect(range.startIso).toBe('2026-01-14T17:00:00.000Z')
    expect(range.endIso).toBe('2026-01-15T17:00:00.000Z')
  })

  it('spans multiple days as [start of first day, start of day after last day)', () => {
    const range = getCustomRange('2026-01-10', '2026-01-12', 'Asia/Phnom_Penh')
    expect(range.startIso).toBe('2026-01-09T17:00:00.000Z')
    expect(range.endIso).toBe('2026-01-12T17:00:00.000Z')
  })
})

describe('getPresetRange', () => {
  afterEach(() => vi.useRealTimers())

  it('today is exactly a 24h window starting at local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z')) // 17:00 in Phnom Penh
    const range = getPresetRange('today', 'Asia/Phnom_Penh')
    expect(range.startIso).toBe('2026-01-14T17:00:00.000Z')
    expect(range.endIso).toBe('2026-01-15T17:00:00.000Z')
  })

  it('this_week starts on Monday', () => {
    // 2026-01-15 is a Thursday.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
    const range = getPresetRange('this_week', 'Asia/Phnom_Penh')
    expect(range.startIso).toBe('2026-01-11T17:00:00.000Z') // Monday 2026-01-12 local midnight
    expect(range.endIso).toBe('2026-01-18T17:00:00.000Z') // following Monday
  })

  it('last_month covers the full previous calendar month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'))
    const range = getPresetRange('last_month', 'Asia/Phnom_Penh')
    expect(range.startIso).toBe('2025-12-31T17:00:00.000Z') // 2026-01-01 local midnight
    expect(range.endIso).toBe('2026-01-31T17:00:00.000Z') // 2026-02-01 local midnight
  })
})

describe('todayDateString', () => {
  afterEach(() => vi.useRealTimers())

  it('reads the calendar date in the given timezone, not the host TZ', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T20:00:00Z')) // 2026-01-16 03:00 in Phnom Penh
    expect(todayDateString('Asia/Phnom_Penh')).toBe('2026-01-16')
  })
})

describe('lastNDaysEnding', () => {
  it('returns n dates ending at (and including) the given date, oldest first', () => {
    expect(lastNDaysEnding('2026-01-15', 7)).toEqual([
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
    ])
  })

  it('crosses a month boundary correctly', () => {
    expect(lastNDaysEnding('2026-03-02', 4)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
  })
})
