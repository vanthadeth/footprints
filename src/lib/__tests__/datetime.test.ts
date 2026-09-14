import { describe, expect, it } from 'vitest'
import { formatDate, formatDuration, formatTime, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '../datetime'

describe('formatDuration', () => {
  it('formats minutes only under an hour', () => {
    expect(formatDuration(42 * 60_000)).toBe('42 min')
  })

  it('formats hours and minutes over an hour', () => {
    expect(formatDuration((2 * 60 + 15) * 60_000)).toBe('2h 15m')
  })

  it('never goes negative for out-of-order timestamps', () => {
    expect(formatDuration(-5000)).toBe('0 min')
  })
})

describe('formatTime', () => {
  it('renders an em dash for a null timestamp', () => {
    expect(formatTime(null)).toBe('—')
  })

  it('renders HH:MM in the Asia/Phnom_Penh timezone regardless of host TZ', () => {
    // 01:30 UTC is 08:30 in Asia/Phnom_Penh (UTC+7).
    expect(formatTime('2026-01-01T01:30:00Z')).toBe('08:30')
  })
})

describe('formatDate', () => {
  it('renders an em dash for a null date', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('always renders dd/mm/yyyy regardless of host locale', () => {
    expect(formatDate('2026-03-05T10:00:00Z')).toBe('05/03/2026')
  })

  it('uses the Asia/Phnom_Penh calendar day, not UTC, near midnight', () => {
    // 17:30 UTC on the 4th is 00:30 on the 5th in Asia/Phnom_Penh (UTC+7).
    expect(formatDate('2026-03-04T17:30:00Z')).toBe('05/03/2026')
  })
})

describe('isPastTimeOfDay', () => {
  // 10:00 UTC is 17:00 in Asia/Phnom_Penh (UTC+7).
  const at1700 = new Date('2026-01-01T10:00:00Z')

  it('is true exactly at the threshold', () => {
    expect(isPastTimeOfDay('17:00', 0, undefined, at1700)).toBe(true)
  })

  it('is false before the threshold', () => {
    expect(isPastTimeOfDay('17:01', 0, undefined, at1700)).toBe(false)
  })

  it('applies a grace period in minutes', () => {
    expect(isPastTimeOfDay('17:00', 30, undefined, at1700)).toBe(false)
    expect(isPastTimeOfDay('16:30', 30, undefined, at1700)).toBe(true)
  })

  it('accepts "HH:MM:SS" as Postgres time columns come back', () => {
    expect(isPastTimeOfDay('17:00:00', 0, undefined, at1700)).toBe(true)
  })
})

describe('isWithinClockInWindow', () => {
  const workStart = '08:00'
  const workEnd = '17:00'
  const earlyMinutes = 15

  // Times in Asia/Phnom_Penh (UTC+7), expressed as UTC for the fake clock.
  const at0744 = new Date('2026-01-01T00:44:00Z') // 07:44 local
  const at0746 = new Date('2026-01-01T00:46:00Z') // 07:46 local
  const at1200 = new Date('2026-01-01T05:00:00Z') // 12:00 local
  const at1700 = new Date('2026-01-01T10:00:00Z') // 17:00 local

  it('is false just before the early-allowance window opens', () => {
    expect(isWithinClockInWindow(workStart, workEnd, earlyMinutes, undefined, at0744)).toBe(false)
  })

  it('is true once the early-allowance window opens', () => {
    expect(isWithinClockInWindow(workStart, workEnd, earlyMinutes, undefined, at0746)).toBe(true)
  })

  it('is true during the working day', () => {
    expect(isWithinClockInWindow(workStart, workEnd, earlyMinutes, undefined, at1200)).toBe(true)
  })

  it('is false at (and after) work_end_time', () => {
    expect(isWithinClockInWindow(workStart, workEnd, earlyMinutes, undefined, at1700)).toBe(false)
  })
})

describe('shiftTimeOfDay', () => {
  it('shifts earlier within the same day', () => {
    expect(shiftTimeOfDay('08:00', -15)).toBe('07:45')
  })

  it('shifts later within the same day', () => {
    expect(shiftTimeOfDay('08:00', 30)).toBe('08:30')
  })

  it('wraps backward past midnight', () => {
    expect(shiftTimeOfDay('00:10', -20)).toBe('23:50')
  })

  it('wraps forward past midnight', () => {
    expect(shiftTimeOfDay('23:50', 20)).toBe('00:10')
  })

  it('accepts "HH:MM:SS" as Postgres time columns come back', () => {
    expect(shiftTimeOfDay('08:00:00', -15)).toBe('07:45')
  })
})
