import { describe, expect, it } from 'vitest'
import { computeLiveFleetKpis, computeUserReportRows, computeVisitKpis } from '../reportStats'
import type { FleetMemberSnapshot } from '@/features/fleet/types'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

function snapshot(overrides: Partial<FleetMemberSnapshot>): FleetMemberSnapshot {
  return {
    member: { id: 'u1', fullName: 'Sok Dara', photoPath: null, position: null, roleName: 'Sales Team', managerId: null, isFieldSales: true },
    status: 'OFF',
    attendance: null,
    openVisit: null,
    visitsToday: [],
    lastLocation: null,
    ...overrides,
  }
}

function attendance(userId: string, clockIn: string, clockOut: string | null): AttendanceRow {
  return { user_id: userId, clock_in_at: clockIn, clock_out_at: clockOut, flags: [] } as unknown as AttendanceRow
}

function visit(userId: string, overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: Math.random().toString(),
    user_id: userId,
    customer_id: 'c1',
    checked_in_at: '2026-01-01T02:00:00Z',
    checked_out_at: '2026-01-01T02:30:00Z',
    auto_closed: false,
    flags: [],
    ...overrides,
  } as VisitRow
}

describe('computeLiveFleetKpis', () => {
  it('classifies each snapshot into exactly one attendance bucket and one fleet bucket', () => {
    const snapshots = [
      snapshot({ status: 'VISITING', attendance: attendance('u1', '2026-01-01T01:00:00Z', null) }),
      snapshot({ status: 'IDLING', attendance: attendance('u2', '2026-01-01T02:00:00Z', null) }),
      snapshot({ status: 'OFF', attendance: attendance('u3', '2026-01-01T01:00:00Z', '2026-01-01T09:00:00Z') }),
      snapshot({ status: 'OFF', attendance: null }),
    ]
    const kpis = computeLiveFleetKpis(snapshots, new Date('2026-01-01T10:00:00Z').getTime())
    expect(kpis.clockedIn).toBe(2) // u1, u2
    expect(kpis.clockedOut).toBe(1) // u3
    expect(kpis.notStarted).toBe(1) // u4
    expect(kpis.visiting).toBe(1)
    expect(kpis.idling).toBe(1)
    expect(kpis.off).toBe(2)
  })

  it('never divides by zero when nobody has clocked in', () => {
    const kpis = computeLiveFleetKpis([snapshot({})])
    expect(kpis.avgClockInTime).toBe('—')
    expect(kpis.avgWorkingDurationMs).toBe(0)
  })
})

describe('computeVisitKpis', () => {
  it('counts unassigned visits without counting them toward unique customers', () => {
    const visits = [visit('u1', { customer_id: null }), visit('u1', { customer_id: 'c1' }), visit('u1', { customer_id: 'c2' })]
    const kpis = computeVisitKpis(visits, 1)
    expect(kpis.totalVisits).toBe(3)
    expect(kpis.unassignedVisits).toBe(1)
    expect(kpis.uniqueCustomers).toBe(2)
  })

  it('averages visits per user across the whole team, not just those with visits', () => {
    const visits = [visit('u1'), visit('u1')]
    expect(computeVisitKpis(visits, 4).avgVisitsPerUser).toBe(0.5)
  })
})

describe('computeUserReportRows', () => {
  it('produces one row per member even for a member with zero activity', () => {
    const rows = computeUserReportRows([{ id: 'u1', fullName: 'Sok Dara' }, { id: 'u2', fullName: 'Chan Vuthy' }], [], [])
    expect(rows).toHaveLength(2)
    expect(rows[1].workingDays).toBe(0)
    expect(rows[1].firstClockIn).toBeNull()
  })

  it('only attributes each attendance/visit row to its own user', () => {
    const attendanceRows = [attendance('u1', '2026-01-01T01:00:00Z', '2026-01-01T09:00:00Z'), attendance('u2', '2026-01-01T02:00:00Z', '2026-01-01T10:00:00Z')]
    const visitRows = [visit('u1'), visit('u2'), visit('u2')]
    const rows = computeUserReportRows([{ id: 'u1', fullName: 'A' }, { id: 'u2', fullName: 'B' }], attendanceRows, visitRows)
    expect(rows[0].visitCount).toBe(1)
    expect(rows[1].visitCount).toBe(2)
  })
})
