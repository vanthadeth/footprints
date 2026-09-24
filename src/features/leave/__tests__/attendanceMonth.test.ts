import { describe, expect, it } from 'vitest'
import { buildAttendanceMonth } from '../attendanceMonth'
import type { LeaveRequest } from '../types'

function req(p: Partial<LeaveRequest>): LeaveRequest {
  return {
    id: 'r',
    user_id: 'u',
    leave_type: 'annual',
    status: 'approved',
    start_date: '2026-09-01',
    end_date: '2026-09-01',
    start_period: 'full',
    end_period: 'full',
    reason: null,
    decision_note: null,
    decided_at: null,
    decided_by: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...p,
  }
}

describe('buildAttendanceMonth', () => {
  it('lays September 2026 out Monday-first (the 1st is a Tuesday)', () => {
    const m = buildAttendanceMonth(2026, 9, new Set(), [], '2026-09-24')
    expect(m.weeks[0][0]).toBeNull()
    expect(m.weeks[0][1]?.day).toBe(1)
    expect(m.weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('marks present days, Sundays, future days and unaccounted past days', () => {
    const m = buildAttendanceMonth(2026, 9, new Set(['2026-09-01', '2026-09-02']), [], '2026-09-24')
    const cells = m.weeks.flat().filter(Boolean)
    expect(cells.find((c) => c!.date === '2026-09-01')!.kind).toBe('present')
    expect(cells.find((c) => c!.date === '2026-09-06')!.kind).toBe('weekend') // Sunday
    expect(cells.find((c) => c!.date === '2026-09-03')!.kind).toBe('none')
    expect(cells.find((c) => c!.date === '2026-09-25')!.kind).toBe('future')
    expect(cells.find((c) => c!.date === '2026-09-24')!.isToday).toBe(true)
    expect(m.presentDays).toBe(2)
  })

  it('counts approved leave by type, halves for morning/afternoon, and skips Sundays inside a range', () => {
    const m = buildAttendanceMonth(
      2026,
      9,
      new Set(['2026-09-10']),
      [
        req({ leave_type: 'annual', start_date: '2026-09-04', end_date: '2026-09-07' }), // Fri, Sat, (Sun), Mon
        req({ leave_type: 'sick', start_date: '2026-09-10', end_date: '2026-09-10', start_period: 'afternoon', end_period: 'afternoon' }),
        req({ leave_type: 'unpaid', status: 'rejected', start_date: '2026-09-15', end_date: '2026-09-15' }),
      ],
      '2026-09-24'
    )
    expect(m.leaveDays).toEqual({ annual: 3, sick: 0.5, unpaid: 0 })
    expect(m.presentDays).toBe(0.5)
    const sick = m.weeks.flat().find((c) => c?.date === '2026-09-10')!
    expect(sick).toMatchObject({ kind: 'leave', leaveType: 'sick', half: true, alsoPresent: true })
  })
})
