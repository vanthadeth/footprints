import { supabase } from '@/lib/supabase'
import { startOfTodayIso } from '@/lib/datetime'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'
import type { FleetMemberSnapshot, FleetStatus, LastLocation, TeamMember } from './types'

function deriveStatus(attendance: AttendanceRow | null, openVisit: VisitRow | null): FleetStatus {
  if (!attendance || attendance.clock_out_at) return 'OFF'
  return openVisit ? 'VISITING' : 'IDLING'
}

function lastLocationFor(sessions: AttendanceRow[], visits: VisitRow[]): LastLocation | null {
  const candidates: LastLocation[] = []
  for (const a of sessions) {
    candidates.push({ latitude: a.clock_in_latitude, longitude: a.clock_in_longitude, at: a.clock_in_at })
    if (a.clock_out_at && a.clock_out_latitude != null && a.clock_out_longitude != null) {
      candidates.push({ latitude: a.clock_out_latitude, longitude: a.clock_out_longitude, at: a.clock_out_at })
    }
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
      departmentId: row.department_id,
      departmentName: row.department_name,
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

    // Several sessions a day are allowed (a lunch break, a split shift): keep them all, oldest first.
    const sessionsByUser = new Map<string, AttendanceRow[]>()
    for (const a of [...(attendanceRes.data ?? [])].sort((x, y) => x.clock_in_at.localeCompare(y.clock_in_at))) {
      const list = sessionsByUser.get(a.user_id) ?? []
      list.push(a)
      sessionsByUser.set(a.user_id, list)
    }
    const visitsByUser = new Map<string, VisitRow[]>()
    for (const v of visitsRes.data ?? []) {
      const list = visitsByUser.get(v.user_id) ?? []
      list.push(v)
      visitsByUser.set(v.user_id, list)
    }

    return team.map((member) => {
      const sessions = sessionsByUser.get(member.id) ?? []
      const attendance = sessions[sessions.length - 1] ?? null
      const visits = visitsByUser.get(member.id) ?? []
      const openVisit = visits.find((v) => !v.checked_out_at) ?? null
      return {
        member,
        status: deriveStatus(attendance, openVisit),
        attendance,
        sessions,
        openVisit,
        visitsToday: visits,
        lastLocation: lastLocationFor(sessions, visits),
      }
    })
  },
}
