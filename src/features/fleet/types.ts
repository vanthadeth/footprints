import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

export interface TeamMember {
  id: string
  fullName: string
  photoPath: string | null
  position: string | null
  roleName: string | null
  managerId: string | null
  isFieldSales: boolean
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
  attendance: AttendanceRow | null
  openVisit: VisitRow | null
  visitsToday: VisitRow[]
  lastLocation: LastLocation | null
}
