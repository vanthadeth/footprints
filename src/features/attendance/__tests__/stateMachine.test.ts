import { describe, expect, it } from 'vitest'
import { deriveAttendanceStatus, deriveVisitStatus, isValidJourneyCombination, summarizeAttendanceTimes } from '../stateMachine'
import type { AttendanceRow, VisitRow } from '../types'

function attendance(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    id: 'a1',
    user_id: 'u1',
    clock_in_at: '2026-01-01T01:00:00Z',
    clock_in_latitude: 11.5,
    clock_in_longitude: 104.9,
    clock_in_accuracy_m: 10,
    clock_in_selfie_path: 'u1/clock-in-1.jpg',
    clock_out_at: null,
    clock_out_latitude: null,
    clock_out_longitude: null,
    clock_out_accuracy_m: null,
    clock_out_selfie_path: null,
    flags: [],
    created_at: '2026-01-01T01:00:00Z',
    updated_at: '2026-01-01T01:00:00Z',
    ...overrides,
  } as AttendanceRow
}

function visit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: 'v1',
    user_id: 'u1',
    customer_id: null,
    checked_in_at: '2026-01-01T02:00:00Z',
    checked_out_at: null,
    in_latitude: 11.5,
    in_longitude: 104.9,
    in_accuracy_m: 10,
    out_latitude: null,
    out_longitude: null,
    out_accuracy_m: null,
    distance_m: null,
    out_of_range: false,
    radius_m: 200,
    visit_type_id: null,
    visit_status_id: null,
    order_status_id: null,
    payment_status_id: null,
    next_appointment: null,
    remarks: '',
    created_at: '2026-01-01T02:00:00Z',
    updated_at: '2026-01-01T02:00:00Z',
    cancelled_at: null,
    cancel_reason: null,
    checkout_distance_m: null,
    checkout_out_of_range: false,
    auto_closed: false,
    attendance_id: 'a1',
    visit_number: 1,
    flags: [],
    ...overrides,
  } as VisitRow
}

describe('deriveAttendanceStatus', () => {
  it('is NOT_CLOCKED_IN with no attendance row', () => {
    expect(deriveAttendanceStatus(null)).toBe('NOT_CLOCKED_IN')
  })

  it('is CLOCKED_IN when the row has no clock_out_at', () => {
    expect(deriveAttendanceStatus(attendance())).toBe('CLOCKED_IN')
  })

  it('is CLOCKED_OUT once clock_out_at is set', () => {
    expect(deriveAttendanceStatus(attendance({ clock_out_at: '2026-01-01T09:00:00Z' }))).toBe('CLOCKED_OUT')
  })
})

describe('deriveVisitStatus', () => {
  it('is NO_ACTIVE_VISIT with no open visit and nothing just auto-closed', () => {
    expect(deriveVisitStatus(null, false)).toBe('NO_ACTIVE_VISIT')
  })

  it('is VISITING while a visit has no checked_out_at', () => {
    expect(deriveVisitStatus(visit(), false)).toBe('VISITING')
  })

  it('is AUTO_CHECKED_OUT right after an auto check-out, even with no open visit', () => {
    expect(deriveVisitStatus(null, true)).toBe('AUTO_CHECKED_OUT')
  })

  it('prefers VISITING over a stale auto-checkout flag if a new visit is somehow already open', () => {
    expect(deriveVisitStatus(visit(), true)).toBe('VISITING')
  })
})

describe('isValidJourneyCombination (spec §54)', () => {
  it.each([
    ['NOT_CLOCKED_IN', 'NO_ACTIVE_VISIT', true],
    ['CLOCKED_IN', 'NO_ACTIVE_VISIT', true],
    ['CLOCKED_IN', 'VISITING', true],
    ['CLOCKED_IN', 'AUTO_CHECKED_OUT', true],
    ['CLOCKED_OUT', 'NO_ACTIVE_VISIT', true],
  ] as const)('%s + %s is valid', (attendanceStatus, visitStatus, expected) => {
    expect(isValidJourneyCombination(attendanceStatus, visitStatus)).toBe(expected)
  })

  it.each([
    ['NOT_CLOCKED_IN', 'VISITING'],
    ['CLOCKED_OUT', 'VISITING'],
    ['NOT_CLOCKED_IN', 'AUTO_CHECKED_OUT'],
    ['CLOCKED_OUT', 'AUTO_CHECKED_OUT'],
  ] as const)('%s + %s is invalid', (attendanceStatus, visitStatus) => {
    expect(isValidJourneyCombination(attendanceStatus, visitStatus)).toBe(false)
  })
})

describe('summarizeAttendanceTimes', () => {
  it('is all null with no sessions today', () => {
    expect(summarizeAttendanceTimes([], null)).toEqual({ clockInTime: null, clockOutTime: null })
  })

  it('uses the first clock-in and the open session has no clock-out yet', () => {
    const open = attendance({ id: 'a1', clock_in_at: '2026-01-01T01:00:00Z' })
    expect(summarizeAttendanceTimes([open], open)).toEqual({ clockInTime: '2026-01-01T01:00:00Z', clockOutTime: null })
  })

  it('uses the most recent clock-out once nothing is open, across multiple sessions', () => {
    const sessions = [
      attendance({ id: 'a1', clock_in_at: '2026-01-01T01:00:00Z', clock_out_at: '2026-01-01T05:00:00Z' }),
      attendance({ id: 'a2', clock_in_at: '2026-01-01T06:00:00Z', clock_out_at: '2026-01-01T09:00:00Z' }),
    ]
    expect(summarizeAttendanceTimes(sessions, null)).toEqual({
      clockInTime: '2026-01-01T01:00:00Z',
      clockOutTime: '2026-01-01T09:00:00Z',
    })
  })

  it('reports no clock-out yet while a later session is still open, even if an earlier one closed', () => {
    const closed = attendance({ id: 'a1', clock_in_at: '2026-01-01T01:00:00Z', clock_out_at: '2026-01-01T05:00:00Z' })
    const open = attendance({ id: 'a2', clock_in_at: '2026-01-01T06:00:00Z' })
    expect(summarizeAttendanceTimes([closed, open], open)).toEqual({
      clockInTime: '2026-01-01T01:00:00Z',
      clockOutTime: null,
    })
  })
})
