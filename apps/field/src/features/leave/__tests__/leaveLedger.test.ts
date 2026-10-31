import { describe, expect, it } from 'vitest'
import { buildLedger, ledgerDelta, type FlexSettlementRow } from '../leaveLedger'
import type { LeaveRequest } from '../types'

const req = (p: Partial<LeaveRequest>): LeaveRequest => ({ id: 'r', user_id: 'u', leave_type: 'annual', status: 'approved', start_date: '2026-10-06', end_date: '2026-10-07', start_period: 'full', end_period: 'full', reason: null, decision_note: null, decided_at: null, decided_by: null, days: 2, created_at: '', updated_at: '', ...p }) as LeaveRequest
const settle = (p: Partial<FlexSettlementRow>): FlexSettlementRow => ({ cycleStart: '2026-09-21', cycleEnd: '2026-10-20', minDays: 20, workedDays: 16, creditedDays: 2, annualDays: 2, unpaidDays: 0, ...p })

describe('buildLedger', () => {
  it('groups the year by month, newest first, leaving out other years and cancelled requests', () => {
    const l = buildLedger(2026, [req({ id: 'a' }), req({ id: 'b', start_date: '2026-09-18', end_date: '2026-09-18', days: 1 }), req({ id: 'c', status: 'cancelled' }), req({ id: 'd', start_date: '2025-12-01', end_date: '2025-12-01' })], [])
    expect(l.map((m) => m.key)).toEqual(['2026-10', '2026-09'])
    expect(l[0].entries).toHaveLength(1)
  })
  it('adds a shortfall row for a settled cycle that took leave, but not legacy or met cycles', () => {
    const l = buildLedger(2026, [], [settle({}), settle({ cycleEnd: '2026-09-20', annualDays: 0, unpaidDays: 0 }), settle({ cycleEnd: '2026-08-20', minDays: null })])
    expect(l).toHaveLength(1)
    expect(l[0].entries[0]).toMatchObject({ kind: 'short', have: 18, min: 20, annual: 2 })
  })
})

describe('ledgerDelta', () => {
  it('counts approved leave by type only', () => {
    expect(ledgerDelta({ kind: 'leave', id: 'x', date: '', endDate: '', type: 'sick', days: 1, status: 'approved', half: false })).toEqual({ annual: 0, unpaid: 0, sick: 1 })
    expect(ledgerDelta({ kind: 'leave', id: 'x', date: '', endDate: '', type: 'annual', days: 2, status: 'pending', half: false })).toEqual({ annual: 0, unpaid: 0, sick: 0 })
  })
  it('takes the shortfall annual and unpaid days', () => {
    expect(ledgerDelta({ kind: 'short', id: 's', date: '', cycleStart: '', cycleEnd: '', have: 18, min: 20, annual: 1, unpaid: 1 })).toEqual({ annual: 1, unpaid: 1, sick: 0 })
  })
})
