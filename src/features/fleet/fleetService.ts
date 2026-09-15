import { supabase } from '@/lib/supabase'
import { startOfTodayIso } from '@/lib/datetime'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'
import type { FleetMemberSnapshot, FleetStatus, LastLocation, TeamMember } from './types'

function deriveStatus(attendance: AttendanceRow | null, openVisit: VisitRow | null): FleetStatus {
  if (!attendance || attendance.clock_out_at) return 'OFF'
  return openVisit ? 'VISITING' : 'IDLING'
}

function lastLocationFor(attendance: AttendanceRow | null, visits: VisitRow[]): LastLocation | null {
  const candidates: LastLocation[] = []
  if (attendance) candidates.push({ latitude: attendance.clock_in_latitude, longitude: attendance.clock_in_longitude, at: attendance.clock_in_at })
  if (attendance?.clock_out_at && attendance.clock_out_latitude != null && attendance.clock_out_longitude != null) {
    candidates.push({ latitude: attendance.clock_out_latitude, longitude: attendance.clock_out_longitude, at: attendance.clock_out_at })
  }
  for (const v of visits) {
    if (v.in_latitude != null && v.in_longitude != null) candidates.push({ latitude: v.in_latitude, longitude: v.in_longitude, at: v.checked_in_at })
    if (v.checked_out_at && v.out_latitude != null && v.out_longitude != null) {
      candidates.push({ latitude: v.out_latitude, longitude: v.out_longitude, at: v.checked_out_at })
    }
  }
  if (candidates.length === 0) return null
  return candidates.reduce((latest, c) => (c.at > latest.at ? c : latest))
}

export const fleetService = {
  async fetchTeam(): Promise<TeamMember[]> {
    const { data, error } = await supabase.rpc('my_team')
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      nickname: row.nickname,
      photoPath: row.photo_path || null,
      position: row.position || null,
      roleName: row.role_name,
      managerId: row.manager_id,
      isFieldSales: row.is_field_sales,
    }))
  },

  /**
   * A live status snapshot for the given team members: today's attendance,
   * today's visits, derived status, and best-known last location. One pair
   * of queries for the whole team rather than N+1 per member.
   */
  async fetchSnapshot(team: TeamMember[]): Promise<FleetMemberSnapshot[]> {
    if (team.length === 0) return []
    const ids = team.map((m) => m.id)
    const since = startOfTodayIso()

    const [attendanceRes, visitsRes] = await Promise.all([
      supabase.from('attendance').select('*').in('user_id', ids).gte('clock_in_at', since),
      supabase.from('visits').select('*').in('user_id', ids).gte('checked_in_at', since).is('cancelled_at', null),
    ])
    if (attendanceRes.error) throw attendanceRes.error
    if (visitsRes.error) throw visitsRes.error

    const attendanceByUser = new Map<string, AttendanceRow>()
    for (const a of attendanceRes.data ?? []) {
      // A user should only have one open (or, today, effectively one) session; keep the most recent.
      const existing = attendanceByUser.get(a.user_id)
      if (!existing || a.clock_in_at > existing.clock_in_at) attendanceByUser.set(a.user_id, a)
    }
    const visitsByUser = new Map<string, VisitRow[]>()
    for (const v of visitsRes.data ?? []) {
      const list = visitsByUser.get(v.user_id) ?? []
      list.push(v)
      visitsByUser.set(v.user_id, list)
    }

    return team.map((member) => {
      const attendance = attendanceByUser.get(member.id) ?? null
      const visits = visitsByUser.get(member.id) ?? []
      const openVisit = visits.find((v) => !v.checked_out_at) ?? null
      return {
        member,
        status: deriveStatus(attendance, openVisit),
        attendance,
        openVisit,
        visitsToday: visits,
        lastLocation: lastLocationFor(attendance, visits),
      }
    })
  },
}
