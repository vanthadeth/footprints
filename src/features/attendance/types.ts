import type { Tables } from '@/types/database.types'

export type AttendanceRow = Tables<'attendance'>
export type VisitRow = Tables<'visits'>

export type AttendanceStatus = 'NOT_CLOCKED_IN' | 'CLOCKED_IN' | 'CLOCKED_OUT'
export type VisitStatus = 'NO_ACTIVE_VISIT' | 'VISITING' | 'AUTO_CHECKED_OUT'

/** The combined state the whole app is built around (spec §54). Only these
 * five combinations are ever valid -- the UI and hooks never construct any
 * other pairing. */
export interface JourneyState {
  attendance: AttendanceStatus
  visit: VisitStatus
  openAttendance: AttendanceRow | null
  openVisit: VisitRow | null
  /** Set right after an auto check-out so the UI can surface why. */
  lastAutoCheckout: { reason: 'outside_radius' | 'clock_out'; visit: VisitRow } | null
}
