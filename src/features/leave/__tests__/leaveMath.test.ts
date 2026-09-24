import { describe, expect, it } from 'vitest'
import { leaveRequestDays } from '../leaveMath'

describe('leaveRequestDays', () => {
  it('counts a full range of whole days inclusive', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-09', false, false)).toBe(5)
  })

  it('subtracts half a day for a half-day start', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-05', true, false)).toBe(0.5)
  })

  it('subtracts half a day for a half-day end', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-07', false, true)).toBe(2.5)
  })

  it('subtracts a full day when both ends are half-day', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-07', true, true)).toBe(2)
  })

  it('nets to zero for a single half-day-both-ends day', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-05', true, true)).toBe(0)
  })
})
