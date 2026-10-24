import { describe, expect, it } from 'vitest'
import { buildActivityLog, groupActivityLogByDay } from '../activityLog'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

function attendance(overrides: Partial<AttendanceRow>): AttendanceRow {
  return {
    id: 'a1',
    user_id: 'u1',
    clock_in_at: '2026-09-20T01:00:00Z',
    clock_out_at: null,
    flags: [],
    ...overrides,
  } as unknown as AttendanceRow
}

function visit(overrides: Partial<VisitRow>): VisitRow {
  return {
    id: 'v1',
    user_id: 'u1',
    customer_id: 'c1',
    checked_in_at: '2026-09-20T02:00:00Z',
    checked_out_at: null,
    visit_status_id: null,
    order_status_id: null,
    payment_status_id: null,
    ...overrides,
  } as unknown as VisitRow
}

describe('buildActivityLog', () => {
  it('emits a clock-in and clock-out entry for a closed session', () => {
    const entries = buildActivityLog([attendance({ clock_out_at: '2026-09-20T09:00:00Z' })], [])
    expect(entries.map((e) => e.kind)).toEqual(['clock-out', 'clock-in'])
  })

  it('emits only a clock-in entry for a still-open session', () => {
    const entries = buildActivityLog([attendance({})], [])
    expect(entries.map((e) => e.kind)).toEqual(['clock-in'])
  })

  it('emits only a check-in entry for a still-open visit, carrying the customer id', () => {
    const entries = buildActivityLog([], [visit({})])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'check-in', customerId: 'c1' })
  })

  it('emits a check-out entry with duration and status fields once closed', () => {
    const entries = buildActivityLog(
      [],
      [visit({ checked_in_at: '2026-09-20T02:00:00Z', checked_out_at: '2026-09-20T03:30:00Z', visit_status_id: 'vs1' })]
    )
    const checkOut = entries.find((e) => e.kind === 'check-out')
    expect(checkOut).toMatchObject({ durationMs: 90 * 60_000, visitStatusId: 'vs1' })
  })

  it('sorts every entry newest-first regardless of input order', () => {
    const entries = buildActivityLog(
      [attendance({ id: 'a1', clock_in_at: '2026-09-20T05:00:00Z' })],
      [visit({ id: 'v1', checked_in_at: '2026-09-20T01:00:00Z' })]
    )
    expect(entries.map((e) => e.id)).toEqual(['in-a1', 'ci-v1'])
  })
})

describe('groupActivityLogByDay', () => {
  it('splits a day into afternoon and morning buckets (afternoon first) in Asia/Phnom_Penh time', () => {
    // 01:00Z / 08:00Z = 08:00 / 15:00 in Asia/Phnom_Penh (+7)
    const entries = buildActivityLog(
      [attendance({ id: 'a1', clock_in_at: '2026-09-20T01:00:00Z' }), attendance({ id: 'a2', clock_in_at: '2026-09-20T08:00:00Z' })],
      []
    )
    const days = groupActivityLogByDay(entries)
    expect(days).toHaveLength(1)
    expect(days[0].dateKey).toBe('2026-09-20')
    expect(days[0].periods.map((p) => p.period)).toEqual(['afternoon', 'morning'])
    expect(days[0].periods[0].entries).toHaveLength(1)
    expect(days[0].periods[1].entries).toHaveLength(1)
  })

  it('orders days newest first', () => {
    const entries = buildActivityLog(
      [attendance({ id: 'a1', clock_in_at: '2026-09-18T01:00:00Z' }), attendance({ id: 'a2', clock_in_at: '2026-09-20T01:00:00Z' })],
      []
    )
    const days = groupActivityLogByDay(entries)
    expect(days.map((d) => d.dateKey)).toEqual(['2026-09-20', '2026-09-18'])
  })

  it('omits an empty period rather than rendering an empty morning/afternoon group', () => {
    const entries = buildActivityLog([attendance({ clock_in_at: '2026-09-20T01:00:00Z' })], [])
    const days = groupActivityLogByDay(entries)
    expect(days[0].periods).toHaveLength(1)
    expect(days[0].periods[0].period).toBe('morning')
  })

  it('keeps entries within the same period newest-first', () => {
    const entries = buildActivityLog(
      [attendance({ id: 'a1', clock_in_at: '2026-09-20T01:00:00Z' }), attendance({ id: 'a2', clock_in_at: '2026-09-20T02:00:00Z' })],
      []
    )
    const days = groupActivityLogByDay(entries)
    expect(days[0].periods[0].entries.map((e) => e.id)).toEqual(['in-a2', 'in-a1'])
  })
})

describe('isAlertEntry', () => {
  it('flags auto-closed and flagged entries only', async () => {
    const { isAlertEntry } = await import('../activityLog')
    expect(isAlertEntry({ id: '1', time: 't', userId: 'u', kind: 'clock-out', auto: true })).toBe(true)
    expect(isAlertEntry({ id: '2', time: 't', userId: 'u', kind: 'check-out', flags: ['SHORT_VISIT'] })).toBe(true)
    expect(isAlertEntry({ id: '3', time: 't', userId: 'u', kind: 'check-in', flags: [] })).toBe(false)
    expect(isAlertEntry({ id: '4', time: 't', userId: 'u', kind: 'check-out', flags: ['UNASSIGNED_VISIT'] })).toBe(false)
  })
})
