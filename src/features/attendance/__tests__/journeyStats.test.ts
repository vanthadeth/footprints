import { describe, expect, it } from 'vitest'
import { computeJourneyStats } from '../journeyStats'
import { DEFAULT_FLAG_RULES } from '../flagRules'
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

describe('computeJourneyStats paid time', () => {
  const day: DayJourney = { date: '2026-01-01', attendance: [attendance('2026-01-01T01:00:00Z', '2026-01-01T09:00:00Z')], visits: [] }

  it('is time clocked in when there is no break rule', () => {
    const stats = computeJourneyStats([day], new Date('2026-01-02T00:00:00Z').getTime())
    expect(stats.totalPaidMs).toBe(stats.totalWorkingMs)
  })

  it('takes the unpaid break off a long day, leaving time clocked in as it was', () => {
    const stats = computeJourneyStats([day], new Date('2026-01-02T00:00:00Z').getTime(), { breakMinutes: 30, breakPaid: false })
    expect(stats.totalWorkingMs).toBe(8 * 60 * 60 * 1000)
    expect(stats.totalPaidMs).toBe(7.5 * 60 * 60 * 1000)
  })
})

describe('computeJourneyStats flag rules', () => {
  const now = new Date('2026-01-01T10:00:00Z').getTime() // 17:00 local
  const day = (visits: VisitRow[], sessions = [attendance('2026-01-01T01:00:00Z', '2026-01-01T09:00:00Z')]): DayJourney[] => [{ date: '2026-01-01', attendance: sessions, visits }]
  // local 08:30-09:00 and 10:00-10:20 (UTC 01:30-02:00, 03:00-03:20)
  const v1 = visit({ checked_in_at: '2026-01-01T01:30:00Z', checked_out_at: '2026-01-01T02:00:00Z' })
  const v2 = visit({ checked_in_at: '2026-01-01T03:00:00Z', checked_out_at: '2026-01-01T03:20:00Z' })

  it('counts the gap between visits and the time after the last check-out to clock-out as flagged idle', () => {
    const stats = computeJourneyStats(day([v1, v2]), now)
    expect(stats.totalGapMs).toBe(60 * 60_000)
    // 09:00 -> 10:00 (60 min), then 10:20 -> 16:00 clock-out (340 min)
    expect(stats.flaggedGaps).toBe(2)
    expect(stats.flaggedGapMs).toBe((60 + 340) * 60_000)
  })

  it('does not flag a gap of 45 min or less, nor the time before the first visit', () => {
    const near = visit({ checked_in_at: '2026-01-01T02:45:00Z', checked_out_at: '2026-01-01T09:00:00Z' }) // 45 min after v1 ends, runs to clock-out
    const stats = computeJourneyStats(day([v1, near]), now)
    expect(stats.flaggedGaps).toBe(0)
  })

  it('counts a forgotten visit at the cap, and the rest as a flagged gap', () => {
    const forgotten = visit({ checked_in_at: '2026-01-01T01:30:00Z', checked_out_at: '2026-01-01T09:00:00Z', flags: ['AUTO_CHECKOUT_CLOCK_OUT'], auto_closed: true })
    const stats = computeJourneyStats(day([forgotten]), now)
    expect(stats.totalVisitingMs).toBe(30 * 60_000)
    expect(stats.flaggedGaps).toBe(1)
    expect(stats.flaggedGapMs).toBe(((9 - 2) * 60 - 0) * 60_000) // 02:00 -> 09:00 UTC
  })

  it('runs the trailing gap to now while still clocked in', () => {
    const stats = computeJourneyStats(day([v1], [attendance('2026-01-01T01:00:00Z', null)]), now)
    expect(stats.flaggedGapMs).toBe(8 * 60 * 60_000) // 02:00 -> 10:00 UTC
  })
})

describe('computeJourneyStats effectiveness inputs', () => {
  const shift = { breakMinutes: 0, breakPaid: true, start: '08:00', end: '17:00' } // 01:00-10:00Z
  const MIN = 60_000

  it('counts only visit time that counts, over paid time inside the hours', () => {
    // Clocked in 05:00-19:00 local (22:00Z-12:00Z); 08:00-17:00 is the person's own day.
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [attendance('2025-12-31T22:00:00Z', '2026-01-01T12:00:00Z')],
        visits: [
          visit({ checked_in_at: '2026-01-01T02:00:00Z', checked_out_at: '2026-01-01T02:03:00Z' }), // drive-by: 0
          visit({ checked_in_at: '2026-01-01T03:00:00Z', checked_out_at: '2026-01-01T04:30:00Z' }), // 90 min: capped at 45
          visit({ checked_in_at: '2026-01-01T05:00:00Z', checked_out_at: '2026-01-01T05:20:00Z' }), // 20 min
        ],
      },
    ]
    const stats = computeJourneyStats(days, new Date('2026-01-02T00:00:00Z').getTime(), shift, { ...DEFAULT_FLAG_RULES, shortVisitMin: 5 })
    expect(stats.creditedVisitMs).toBe(65 * MIN)
    expect(stats.totalPaidMs).toBe(14 * 3_600_000)
    expect(stats.scheduledPaidMs).toBe(9 * 3_600_000)
  })

  it('counts unique customers per day and expects the day-scaled target', () => {
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [attendance('2026-01-01T01:00:00Z', '2026-01-01T09:00:00Z')],
        visits: [
          visit({ customer_id: 'a', checked_in_at: '2026-01-01T02:00:00Z', checked_out_at: '2026-01-01T02:30:00Z' }),
          visit({ customer_id: 'a', checked_in_at: '2026-01-01T03:00:00Z', checked_out_at: '2026-01-01T03:30:00Z' }),
          visit({ customer_id: 'b', checked_in_at: '2026-01-01T04:00:00Z', checked_out_at: '2026-01-01T04:30:00Z' }),
          visit({ customer_id: null, checked_in_at: '2026-01-01T05:00:00Z', checked_out_at: '2026-01-01T05:30:00Z' }),
        ],
      },
      {
        date: '2026-01-03', // a half-day Saturday: 08:30-12:00 is 3.5 h of an 8 h day
        attendance: [attendance('2026-01-03T01:30:00Z', '2026-01-03T05:00:00Z')],
        visits: [visit({ customer_id: 'a', checked_in_at: '2026-01-03T02:00:00Z', checked_out_at: '2026-01-03T02:30:00Z' })],
      },
    ]
    const sat = { breakMinutes: 0, breakPaid: true, start: '08:30', end: '12:00' }
    // Same rule for both days here, so check the weekday alone and the Saturday alone.
    const weekday = computeJourneyStats([days[0]], 0, shift)
    expect(weekday.uniqueCustomers).toBe(2)
    expect(weekday.uniqueCustomerTarget).toBe(5)
    const saturday = computeJourneyStats([days[1]], 0, sat)
    expect(saturday.uniqueCustomers).toBe(1)
    expect(saturday.uniqueCustomerTarget).toBe(2)
  })

  it('counts visits that count, ordered visits, and what was forgotten', () => {
    const days: DayJourney[] = [
      {
        date: '2026-01-01',
        attendance: [{ ...attendance('2026-01-01T01:00:00Z', '2026-01-01T10:00:00Z'), auto_clocked_out: true } as AttendanceRow, attendance('2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z')],
        visits: [
          visit({ checked_in_at: '2026-01-01T02:00:00Z', checked_out_at: '2026-01-01T02:03:00Z' }), // under 5 min: not credited
          visit({ checked_in_at: '2026-01-01T03:00:00Z', checked_out_at: '2026-01-01T03:30:00Z', order_amount_usd: 120 }),
          visit({ checked_in_at: '2026-01-01T04:00:00Z', checked_out_at: '2026-01-01T08:00:00Z', flags: ['AUTO_CHECKOUT_CLOCK_OUT'], auto_closed: true }),
          visit({ checked_in_at: '2026-01-01T09:00:00Z', checked_out_at: '2026-01-01T09:20:00Z', cancelled_at: '2026-01-01T09:30:00Z' }), // voided: ignored
        ],
      },
    ]
    const stats = computeJourneyStats(days, 0, null, { ...DEFAULT_FLAG_RULES, shortVisitMin: 5 })
    expect(stats.totalVisits).toBe(3)
    expect(stats.creditedVisits).toBe(2)
    expect(stats.orderedVisits).toBe(1)
    expect(stats.forgottenCheckouts).toBe(1)
    expect(stats.forgottenClockOuts).toBe(1)
  })
})

