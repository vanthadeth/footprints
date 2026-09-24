import { describe, expect, it } from 'vitest'
import { bucketAverage, comparableCutoff, effectiveness, highlightSentence, topCustomers, visitBuckets, zonedParts } from '../personalReport'

const TZ = 'Asia/Phnom_Penh' // UTC+7, no DST
// Thursday 24 Sep 2026, 14:05 in Phnom Penh
const NOW = '2026-09-24T07:05:00Z'

describe('zonedParts', () => {
  it('reads the calendar date/hour/weekday in the given timezone', () => {
    expect(zonedParts(NOW, TZ)).toEqual({ year: 2026, month: 9, day: 24, hour: 14, weekday: 3 })
  })
})

describe('visitBuckets', () => {
  it('buckets today by hour and nulls future hours', () => {
    const visits = [{ checked_in_at: '2026-09-24T01:42:00Z' }, { checked_in_at: '2026-09-24T02:10:00Z', cancelled_at: '2026-09-24T02:20:00Z' }, { checked_in_at: '2026-09-24T06:22:00Z' }]
    const b = visitBuckets('today', visits, NOW, TZ)
    expect(b[0].label).toBe('7a')
    expect(b.find((x) => x.label === '8a')!.value).toBe(1) // 08:42
    expect(b.find((x) => x.label === '9a')!.value).toBe(0) // cancelled one ignored
    expect(b.find((x) => x.label === '1p')!.value).toBe(1) // 13:22
    expect(b.find((x) => x.label === '2p')!.current).toBe(true)
    expect(b.find((x) => x.label === '3p')!.value).toBeNull()
  })

  it('buckets this week Monday-first and nulls days after today', () => {
    const visits = [{ checked_in_at: '2026-09-21T02:00:00Z' }, { checked_in_at: '2026-09-21T05:00:00Z' }, { checked_in_at: '2026-09-24T03:00:00Z' }, { checked_in_at: '2026-09-18T03:00:00Z' }]
    const b = visitBuckets('week', visits, NOW, TZ)
    expect(b.map((x) => x.value)).toEqual([2, 0, 0, 1, null, null, null])
    expect(b[3].current).toBe(true)
  })

  it('buckets this month by week-of-month', () => {
    const visits = [{ checked_in_at: '2026-09-02T03:00:00Z' }, { checked_in_at: '2026-09-22T03:00:00Z' }, { checked_in_at: '2026-08-30T03:00:00Z' }]
    const b = visitBuckets('month', visits, NOW, TZ)
    expect(b.map((x) => x.label)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5'])
    expect(b.map((x) => x.value)).toEqual([1, 0, 0, 1, null])
  })
})

describe('bucketAverage', () => {
  it('averages only buckets that have happened', () => {
    expect(bucketAverage([{ label: 'a', value: 2, current: false }, { label: 'b', value: 4, current: true }, { label: 'c', value: null, current: false }])).toBe(3)
    expect(bucketAverage([])).toBe(0)
  })
})

describe('topCustomers', () => {
  it('ranks by visit count, skipping unassigned and cancelled visits', () => {
    const visits = [
      { checked_in_at: 'x', customer_id: 'a' },
      { checked_in_at: 'x', customer_id: 'b' },
      { checked_in_at: 'x', customer_id: 'b' },
      { checked_in_at: 'x', customer_id: null },
      { checked_in_at: 'x', customer_id: 'a', cancelled_at: 'y' },
    ]
    expect(topCustomers(visits)).toEqual([
      { customerId: 'b', visits: 2 },
      { customerId: 'a', visits: 1 },
    ])
  })
})

describe('effectiveness', () => {
  it('is visiting ÷ working, capped at 1, and 0 with no working time', () => {
    expect(effectiveness({ totalVisitingMs: 30, totalWorkingMs: 100 })).toBeCloseTo(0.3)
    expect(effectiveness({ totalVisitingMs: 300, totalWorkingMs: 100 })).toBe(1)
    expect(effectiveness({ totalVisitingMs: 0, totalWorkingMs: 0 })).toBe(0)
  })
})

describe('highlightSentence', () => {
  it('describes the change against the previous period', () => {
    expect(highlightSentence('week', 19, 16)).toBe('You made 3 more visits than this point last week.')
    expect(highlightSentence('today', 2, 3)).toBe('You made 1 fewer visit than this time yesterday.')
    expect(highlightSentence('month', 5, 5)).toBe('Same number of visits as this point last month.')
    expect(highlightSentence('week', 0, 0)).toBe('No visits yet — nothing to compare with this point last week.')
  })
})

describe('comparableCutoff', () => {
  it('cuts the previous period at the same elapsed time', () => {
    // 3.5 days into this week -> 3.5 days into last week
    expect(comparableCutoff('2026-09-20T17:00:00Z', '2026-09-13T17:00:00Z', '2026-09-24T05:00:00Z', '2026-09-20T17:00:00Z')).toBe('2026-09-17T05:00:00.000Z')
  })

  it('never runs past the end of the previous period (late March vs a 28-day February)', () => {
    expect(comparableCutoff('2026-02-28T17:00:00Z', '2026-01-31T17:00:00Z', '2026-03-30T16:00:00Z', '2026-02-28T17:00:00Z')).toBe('2026-02-28T17:00:00.000Z')
  })
})
