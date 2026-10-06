import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

export interface TeamMember {
  id: string
  fullName: string
  nickname: string | null
  photoPath: string | null
  position: string | null
  roleName: string | null
  managerId: string | null
  isFieldSales: boolean
  departmentId: string | null
  departmentName: string | null
}

/** Fleet status (spec §33): CLOCKED_IN + active visit = VISITING, CLOCKED_IN + no visit = IDLING, NOT_CLOCKED_IN/CLOCKED_OUT = OFF. */
export type FleetStatus = 'VISITING' | 'IDLING' | 'OFF'

export interface LastLocation {
  latitude: number
  longitude: number
  /** ISO timestamp this position was actually observed at -- used for the "Updated Xm ago" freshness indicator. */
  at: string
}

export interface FleetMemberSnapshot {
  member: TeamMember
  status: FleetStatus
  /** The latest session today (open or closed): what the person is doing now. */
  attendance: AttendanceRow | null
  /** Every session that started today, oldest first; a day can have several (a lunch break, a split shift). */
  sessions: AttendanceRow[]
  openVisit: VisitRow | null
  visitsToday: VisitRow[]
  lastLocation: LastLocation | null
}
