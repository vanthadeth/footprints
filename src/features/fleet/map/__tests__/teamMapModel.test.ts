import { describe, expect, it } from 'vitest'
import { ageLabel, isStale, minutesSince } from '../lastKnown'
import { classifyCoverage } from '../customerCoverage'
import { buildTeamRoute } from '../teamRoute'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

describe('lastKnown', () => {
  it('formats ages compactly', () => {
    expect(ageLabel(0)).toBe('now')
    expect(ageLabel(12)).toBe('12m')
    expect(ageLabel(125)).toBe('2h 5m')
    expect(ageLabel(120)).toBe('2h')
  })

  it('counts whole minutes and never goes negative', () => {
    const now = Date.parse('2026-09-24T07:00:00Z')
    expect(minutesSince('2026-09-24T06:48:30Z', now)).toBe(11)
    expect(minutesSince('2026-09-24T07:05:00Z', now)).toBe(0)
  })

  it('only treats a long-idle person as stale', () => {
    expect(isStale('IDLING', 50)).toBe(true)
    expect(isStale('IDLING', 10)).toBe(false)
    expect(isStale('VISITING', 200)).toBe(false)
    expect(isStale('OFF', 200)).toBe(false)
  })
})

describe('classifyCoverage', () => {
  it('marks visited in range, then overdue past the due window (or never visited), else not visited', () => {
    const res = classifyCoverage(
      [
        { id: 'a', lastVisitDate: '2026-09-01' },
        { id: 'b', lastVisitDate: '2026-09-20' },
        { id: 'c', lastVisitDate: '2026-08-01' },
        { id: 'd', lastVisitDate: null },
        { id: 'e', lastVisitDate: '2026-08-01' },
      ],
      new Set(['a']),
      { e: '2026-09-22' },
      '2026-09-24',
      14
    )
    expect(res.a.status).toBe('visited')
    expect(res.b).toEqual({ status: 'unvisited', daysSince: 4 })
    expect(res.c.status).toBe('overdue')
    expect(res.d).toEqual({ status: 'overdue', daysSince: null })
    // a newer visit from the fetched range beats a stale directory date
    expect(res.e).toEqual({ status: 'unvisited', daysSince: 2 })
  })
})

function att(p: Partial<AttendanceRow>): AttendanceRow {
  return { id: 'a', user_id: 'u', clock_in_at: '2026-09-24T01:00:00Z', clock_in_latitude: 11.55, clock_in_longitude: 104.92, clock_out_at: null, clock_out_latitude: null, clock_out_longitude: null, ...p } as unknown as AttendanceRow
}
function vis(p: Partial<VisitRow>): VisitRow {
  return { id: 'v', user_id: 'u', customer_id: 'c', cancelled_at: null, flags: [], auto_closed: false, out_of_range: false, out_latitude: null, out_longitude: null, ...p } as unknown as VisitRow
}

describe('buildTeamRoute', () => {
  it('orders clock-in and numbered visits, flags a long stationary gap, and a trailing idle', () => {
    const route = buildTeamRoute(
      {
        date: '2026-09-24',
        attendance: [att({})],
        visits: [
          vis({ id: 'v1', checked_in_at: '2026-09-24T01:30:00Z', checked_out_at: '2026-09-24T02:00:00Z', in_latitude: 11.56, in_longitude: 104.93 }),
          // 60 min later, ~10 m away -> idle
          vis({ id: 'v2', checked_in_at: '2026-09-24T03:00:00Z', checked_out_at: '2026-09-24T03:20:00Z', in_latitude: 11.5601, in_longitude: 104.93 }),
        ],
      },
      '2026-09-24T05:00:00Z'
    )
    expect(route.events.map((e) => e.kind)).toEqual(['clock-in', 'visit', 'idle', 'visit', 'idle'])
    expect(route.events[1].n).toBe(1)
    expect(route.events[3].n).toBe(2)
    expect(route.events[2].minutes).toBe(60)
    expect(route.events[4]).toMatchObject({ kind: 'idle', ongoing: true, minutes: 100 })
    expect(route.stats.visits).toBe(2)
    expect(route.stats.visitingMs).toBe(50 * 60_000)
    expect(route.stats.idleMs).toBe(160 * 60_000)
    expect(route.path).toHaveLength(3)
  })

  it('does not call a long gap idle when the person moved far', () => {
    const route = buildTeamRoute(
      {
        date: '2026-09-24',
        attendance: [att({})],
        visits: [
          vis({ id: 'v1', checked_in_at: '2026-09-24T01:30:00Z', checked_out_at: '2026-09-24T02:00:00Z', in_latitude: 11.56, in_longitude: 104.93 }),
          vis({ id: 'v2', checked_in_at: '2026-09-24T03:00:00Z', checked_out_at: null, in_latitude: 11.6, in_longitude: 104.93 }),
        ],
      },
      '2026-09-24T03:10:00Z'
    )
    expect(route.events.map((e) => e.kind)).toEqual(['clock-in', 'visit', 'visit'])
    expect(route.events[2].ongoing).toBe(true)
  })

  it('returns an empty route for no day', () => {
    expect(buildTeamRoute(null).events).toEqual([])
  })
})
