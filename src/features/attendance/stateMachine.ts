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
