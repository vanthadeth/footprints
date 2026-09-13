import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime, isPastTimeOfDay } from '../datetime'

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
