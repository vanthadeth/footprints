import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime } from '../datetime'

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
