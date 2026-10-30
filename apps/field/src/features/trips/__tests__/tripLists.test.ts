import { describe, expect, it } from 'vitest'
import { approverChecks, historyKind, historyYears, isUpcoming, monthGroups, splitTrips, yearSummary } from '../tripLists'
import type { TripRow, TripStatus } from '../tripService'

const trip = (id: string, status: TripStatus, start: string, end: string, extra: Partial<TripRow> = {}): TripRow =>
  ({
    id, user_id: 'u1', requester: 'Dara', requester_role: null, status, start_date: start, end_date: end, note: null, total_km: 0,
    day_rate: 10, night_rate: 15, km_rate: 0, fuel_amount: 0, people_count: 1, room_nights: 0, special_total: 0, est_total: 100,
    decided_by: null, decided_at: null, decision_note: null, created_at: '2026-10-01T09:00:00Z', can_decide: false,
    transferred_at: null, transferred_by: null, transfer_ref: null, can_transfer: false, days: [], people: [], specials: [], ...extra,
  }) as TripRow

const TODAY = '2026-10-30'
const ALL = [
  trip('a', 'pending', '2026-11-10', '2026-11-14'),
  trip('b', 'approved', '2026-10-28', '2026-11-01'),
  trip('c', 'approved', '2026-10-06', '2026-10-08'),
  trip('d', 'rejected', '2026-09-22', '2026-09-22'),
  trip('e', 'cancelled', '2026-09-01', '2026-09-03'),
  trip('f', 'approved', '2025-12-02', '2025-12-04'),
  trip('g', 'pending', '2026-10-01', '2026-10-02'),
]

describe('splitTrips', () => {
  it('keeps a trip you are on today in upcoming, soonest first', () => {
    const { upcoming, history } = splitTrips(ALL, TODAY)
    expect(upcoming.map((t) => t.id)).toEqual(['b', 'a'])
    expect(history.map((t) => t.id)).toEqual(['c', 'g', 'd', 'e', 'f'])
    expect(isUpcoming(ALL[0], TODAY)).toBe(true)
  })
})

describe('history', () => {
  const { history } = splitTrips(ALL, TODAY)
  it('names rows done, rejected or cancelled (never-decided past trips count as cancelled)', () => {
    expect(history.map(historyKind)).toEqual(['done', 'cancelled', 'rejected', 'cancelled', 'done'])
  })
  it('lists the years with history, newest first, always including this year', () => {
    expect(historyYears(history, TODAY)).toEqual(['2026', '2025'])
    expect(historyYears([], TODAY)).toEqual(['2026'])
  })
  it('groups by month, latest first, and filters', () => {
    expect(monthGroups(history, '2026', 'all').map((g) => [g.label, g.trips.map((t) => t.id)])).toEqual([
      ['October 2026', ['c', 'g']],
      ['September 2026', ['d', 'e']],
    ])
    expect(monthGroups(history, '2026', 'rejected').map((g) => g.label)).toEqual(['September 2026'])
    expect(monthGroups(history, '2026', 'done').map((g) => g.trips.map((t) => t.id))).toEqual([['c']])
    expect(monthGroups(history, '2025', 'all')).toHaveLength(1)
  })
})

describe('yearSummary', () => {
  it("counts only that person's approved trips in the year", () => {
    const rows = [trip('x', 'approved', '2026-03-01', '2026-03-02', { days: [{ day_no: 1 } as never, { day_no: 2 } as never], est_total: 50 }), trip('y', 'pending', '2026-04-01', '2026-04-02'), trip('z', 'approved', '2025-04-01', '2025-04-02'), trip('w', 'approved', '2026-05-01', '2026-05-01', { user_id: 'u2' })]
    expect(yearSummary(rows, 'u1', '2026')).toEqual({ trips: 1, days: 2, total: 50 })
  })
})

describe('approverChecks', () => {
  const opts = { noticeHours: 24, specialCap: 100 }
  it('passes notice and a small special allowance', () => {
    const c = approverChecks(trip('a', 'pending', '2026-10-12', '2026-10-14', { special_total: 5 }), opts)
    expect(c.every((x) => x.ok)).toBe(true)
    expect(c[0].title).toBe('Sent 10 days before leaving')
  })
  it('flags late sends, an over-limit special allowance and long days', () => {
    const days = [{ day_no: 1, km: 120 }, { day_no: 2, km: 310 }] as never
    const c = approverChecks(trip('a', 'pending', '2026-10-01', '2026-10-02', { special_total: 130, days }), opts)
    expect(c.filter((x) => !x.ok).map((x) => x.title)).toEqual(['Sent late', 'Special allowance is over the limit', 'Long day on day 2'])
  })
})
