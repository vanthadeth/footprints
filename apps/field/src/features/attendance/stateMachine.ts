import type { AttendanceRow, AttendanceStatus, VisitRow, VisitStatus } from './types'

/**
 * Pure derivation of the combined attendance + visit state (spec §54).
 * Kept separate from useJourney so the state machine itself -- the part
 * that must never allow NOT_CLOCKED_IN+VISITING or CLOCKED_OUT+VISITING --
 * is unit-testable without mocking Supabase or the DOM.
 */

export function deriveAttendanceStatus(openAttendance: AttendanceRow | null): AttendanceStatus {
  if (!openAttendance) return 'NOT_CLOCKED_IN'
  return openAttendance.clock_out_at ? 'CLOCKED_OUT' : 'CLOCKED_IN'
}

export function deriveVisitStatus(openVisit: VisitRow | null, justAutoClosed: boolean): VisitStatus {
  if (openVisit && !openVisit.checked_out_at) return 'VISITING'
  return justAutoClosed ? 'AUTO_CHECKED_OUT' : 'NO_ACTIVE_VISIT'
}

const VALID_COMBINATIONS: ReadonlySet<string> = new Set([
  'NOT_CLOCKED_IN:NO_ACTIVE_VISIT',
  'CLOCKED_IN:NO_ACTIVE_VISIT',
  'CLOCKED_IN:VISITING',
  'CLOCKED_IN:AUTO_CHECKED_OUT',
  'CLOCKED_OUT:NO_ACTIVE_VISIT',
])

export function isValidJourneyCombination(attendance: AttendanceStatus, visit: VisitStatus): boolean {
  return VALID_COMBINATIONS.has(`${attendance}:${visit}`)
}

/**
 * A day can now have more than one clock-in/clock-out pair (spec update --
 * multiple sessions per day are allowed, e.g. a lunch break). For a compact
 * "Clock In / Clock Out" display that still makes sense across sessions:
 * the first clock-in of the day, and -- only once nothing is currently
 * open -- the most recent clock-out. While still clocked in, clockOutTime
 * is null rather than some earlier session's stale value.
 */
export function summarizeAttendanceTimes(
  todaysAttendance: AttendanceRow[],
  openAttendance: AttendanceRow | null
): {
  clockInTime: string | null
  clockOutTime: string | null
  clockInLocationId: string | null
  clockOutLocationId: string | null
} {
  if (todaysAttendance.length === 0) {
    return { clockInTime: null, clockOutTime: null, clockInLocationId: null, clockOutLocationId: null }
  }
  const sorted = [...todaysAttendance].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))
  const last = sorted[sorted.length - 1]
  return {
    clockInTime: sorted[0].clock_in_at,
    clockOutTime: openAttendance ? null : (last.clock_out_at ?? null),
    clockInLocationId: sorted[0].clock_in_location_id ?? null,
    clockOutLocationId: openAttendance ? null : (last.clock_out_location_id ?? null),
  }
}
