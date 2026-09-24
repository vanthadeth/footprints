import { describe, expect, it } from 'vitest'
import { leaveRequestDays } from '../leaveMath'

describe('leaveRequestDays', () => {
  it('counts a full range of whole days inclusive', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-09', 'full', 'full')).toBe(5)
  })

  it('subtracts half a day for an afternoon-only start', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-05', 'afternoon', 'full')).toBe(0.5)
  })

  it('subtracts half a day for a morning-only end', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-07', 'full', 'morning')).toBe(2.5)
  })

  it('subtracts a full day when both ends are half-day', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-07', 'afternoon', 'morning')).toBe(2)
  })

  it('nets to zero for a single half-day-both-ends day', () => {
    expect(leaveRequestDays('2026-01-05', '2026-01-05', 'afternoon', 'morning')).toBe(0)
  })
})
