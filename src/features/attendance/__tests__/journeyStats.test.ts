import { describe, expect, it } from 'vitest'
import { computeJourneyStats } from '../journeyStats'
import type { DayJourney } from '../useJourneyHistory'
import type { AttendanceRow, VisitRow } from '../types'

function attendance(clockIn: string, clockOut: string | null): AttendanceRow {
  return { clock_in_at: clockIn, clock_out_at: clockOut } as AttendanceRow
}

function visit(overrides: Partial<VisitRow>): VisitRow {
  return {
    id: Math.random().toString(),
    customer_id: 'c1',
    checked_in_at: '2026-01-01T02:00:00Z',
    checked_out_at: '2026-01-01T02:30:00Z',
    auto_closed: false,
    flags: [],
    ...overrides,
  } as VisitRow
}

describe('computeJourneyStats', () => {
  it('sums working time from clock in to clock out, not to now, once closed', () => {
    const days: DayJourney[] = [{ date: '2026-01-01', attendance: [attendance('2026-01-01T01:00:00Z', '2026-01-01T09:00:00Z')], visits: [] }]
    const stats = computeJourneyStats(days, new Date('2026-01-02T00:00:00Z').getTime())
    expect(stats.totalWorkingMs).toBe(8 * 60 * 60 * 1000)
    expect(stats.workingDays).toBe(1)
  })

  it('counts an open attendance session up to "now", not as zero', () => {
    const now = new Date('2026-01-01T03:00:00Z').getTime()
    const days: DayJourney[] = [{ date: '2026-01-01', attendance: [attendance('2026-01-01T01:00:00Z', null)], visits: [] }]
    expect(computeJourneyStats(days, now).totalWorkingMs).toBe(2 * 60 * 60 * 1000)
  })

  it('sums working time across multiple clock-in/clock-out sessions in one day', () => {
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [
          attendance('2026-01-01T01:00:00Z', '2026-01-01T05:00:00Z'), // 4h
          attendance('2026-01-01T06:00:00Z', '2026-01-01T09:00:00Z'), // 3h
        ],
        visits: [],
      },
    ]
    const stats = computeJourneyStats(days, new Date('2026-01-02T00:00:00Z').getTime())
    expect(stats.totalWorkingMs).toBe(7 * 60 * 60 * 1000)
    expect(stats.workingDays).toBe(1)
  })

  it('computes a gap between consecutive visits, never double-counting it as visit time', () => {
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [],
        visits: [
          visit({ checked_in_at: '2026-01-01T09:05:00Z', checked_out_at: '2026-01-01T09:47:00Z' }),
          visit({ checked_in_at: '2026-01-01T10:05:00Z', checked_out_at: '2026-01-01T10:40:00Z' }),
        ],
      },
    ]
    const stats = computeJourneyStats(days)
    expect(stats.totalGapMs).toBe(18 * 60 * 1000)
    expect(stats.totalVisitingMs).toBe(42 * 60 * 1000 + 35 * 60 * 1000)
  })

  it('has no gap before the first visit of a day', () => {
    const days: DayJourney[] = [
      { date: '2026-01-01', attendance: [], visits: [visit({ checked_in_at: '2026-01-01T09:05:00Z', checked_out_at: '2026-01-01T09:47:00Z' })] },
    ]
    expect(computeJourneyStats(days).totalGapMs).toBe(0)
  })

  it('counts unassigned, auto-closed, and flagged visits separately', () => {
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [],
        visits: [
          visit({ customer_id: null, flags: ['UNASSIGNED_VISIT'] }),
          visit({ auto_closed: true, flags: ['AUTO_CHECKOUT_OUTSIDE_RADIUS'] }),
          visit({}),
        ],
      },
    ]
    const stats = computeJourneyStats(days)
    expect(stats.totalVisits).toBe(3)
    expect(stats.unassignedVisits).toBe(1)
    expect(stats.autoCheckouts).toBe(1)
    expect(stats.flaggedVisits).toBe(2)
  })

  it('excludes a voided visit entirely -- it never happened', () => {
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [],
        visits: [
          visit({ checked_in_at: '2026-01-01T09:05:00Z', checked_out_at: '2026-01-01T09:47:00Z' }),
          visit({
            checked_in_at: '2026-01-01T10:05:00Z',
            checked_out_at: '2026-01-01T10:40:00Z',
            cancelled_at: '2026-01-01T11:00:00Z',
            cancel_reason: 'Voided by user',
          }),
        ],
      },
    ]
    const stats = computeJourneyStats(days)
    expect(stats.totalVisits).toBe(1)
    expect(stats.totalVisitingMs).toBe(42 * 60 * 1000)
    expect(stats.totalGapMs).toBe(0)
  })
})
