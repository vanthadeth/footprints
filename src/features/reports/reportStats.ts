import type { AttendanceRow, VisitRow } from '@/features/attendance/types'
import type { FleetMemberSnapshot } from '@/features/fleet/types'
import { formatTime } from '@/lib/datetime'

export interface LiveFleetKpis {
  clockedIn: number
  clockedOut: number
  notStarted: number
  avgClockInTime: string
  avgWorkingDurationMs: number
  visiting: number
  idling: number
  off: number
  trackingIssues: number
}

/** The "right now" half of the Dashboard (spec §37 Attendance + Fleet sections) -- always today, never date-filtered. */
export function computeLiveFleetKpis(snapshots: FleetMemberSnapshot[], now: number = Date.now()): LiveFleetKpis {
  let clockedIn = 0
  let clockedOut = 0
  let notStarted = 0
  let visiting = 0
  let idling = 0
  let off = 0
  let trackingIssues = 0
  const clockInTimes: number[] = []
  const workingDurations: number[] = []

  for (const s of snapshots) {
    if (s.status === 'VISITING') visiting += 1
    else if (s.status === 'IDLING') idling += 1
    else off += 1

    if (!s.attendance) {
      notStarted += 1
      continue
    }
    if (s.attendance.clock_out_at) clockedOut += 1
    else clockedIn += 1

    const start = new Date(s.attendance.clock_in_at)
    clockInTimes.push(start.getHours() * 60 + start.getMinutes())
    const end = s.attendance.clock_out_at ? new Date(s.attendance.clock_out_at).getTime() : now
    workingDurations.push(end - start.getTime())

    if (s.attendance.flags?.includes('TRACKING_INTERRUPTED')) trackingIssues += 1
  }

  const avgMinutes = clockInTimes.length ? clockInTimes.reduce((a, b) => a + b, 0) / clockInTimes.length : null
  const avgClockInTime =
    avgMinutes == null ? '—' : `${String(Math.floor(avgMinutes / 60)).padStart(2, '0')}:${String(Math.round(avgMinutes % 60)).padStart(2, '0')}`

  return {
    clockedIn,
    clockedOut,
    notStarted,
    avgClockInTime,
    avgWorkingDurationMs: workingDurations.length ? workingDurations.reduce((a, b) => a + b, 0) / workingDurations.length : 0,
    visiting,
    idling,
    off,
    trackingIssues,
  }
}

export interface VisitKpis {
  totalVisits: number
  avgVisitsPerUser: number
  avgVisitDurationMs: number
  totalVisitingMs: number
  unassignedVisits: number
  autoCheckouts: number
  flaggedVisits: number
  uniqueCustomers: number
}

/** The date-filterable half of the Dashboard (Visits + Customer Coverage sections). */
export function computeVisitKpis(visits: VisitRow[], userCount: number, now: number = Date.now()): VisitKpis {
  let totalVisitingMs = 0
  let unassignedVisits = 0
  let autoCheckouts = 0
  let flaggedVisits = 0
  const customers = new Set<string>()

  for (const v of visits) {
    const end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : now
    totalVisitingMs += Math.max(0, end - new Date(v.checked_in_at).getTime())
    if (!v.customer_id) unassignedVisits += 1
    else customers.add(v.customer_id)
    if (v.auto_closed) autoCheckouts += 1
    if (v.flags && v.flags.length > 0) flaggedVisits += 1
  }

  return {
    totalVisits: visits.length,
    avgVisitsPerUser: userCount > 0 ? visits.length / userCount : 0,
    avgVisitDurationMs: visits.length > 0 ? totalVisitingMs / visits.length : 0,
    totalVisitingMs,
    unassignedVisits,
    autoCheckouts,
    flaggedVisits,
    uniqueCustomers: customers.size,
  }
}

export interface UserReportRow {
  userId: string
  fullName: string
  nickname: string | null
  workingDays: number
  firstClockIn: string | null
  lastClockOut: string | null
  totalWorkingMs: number
  visitCount: number
  totalVisitMs: number
  avgVisitMs: number
  totalGapMs: number
  uniqueCustomers: number
  unassignedVisits: number
  autoCheckouts: number
  flaggedVisits: number
}

/** Per-user rows for both the User Report and the Fleet Report's comparison table (spec §39-40). */
export function computeUserReportRows(
  members: { id: string; fullName: string; nickname?: string | null }[],
  attendanceRows: AttendanceRow[],
  visitRows: VisitRow[],
  now: number = Date.now()
): UserReportRow[] {
  return members.map((member) => {
    const myAttendance = attendanceRows.filter((a) => a.user_id === member.id)
    const myVisits = visitRows.filter((v) => v.user_id === member.id)

    const workDayKeys = new Set(myAttendance.map((a) => a.clock_in_at.slice(0, 10)))
    const totalWorkingMs = myAttendance.reduce((sum, a) => {
      const end = a.clock_out_at ? new Date(a.clock_out_at).getTime() : now
      return sum + Math.max(0, end - new Date(a.clock_in_at).getTime())
    }, 0)

    const byDay = new Map<string, VisitRow[]>()
    for (const v of myVisits) {
      const key = v.checked_in_at.slice(0, 10)
      byDay.set(key, [...(byDay.get(key) ?? []), v])
    }
    let totalGapMs = 0
    for (const dayVisits of byDay.values()) {
      const sorted = [...dayVisits].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
      for (let i = 1; i < sorted.length; i++) {
        if (!sorted[i - 1].checked_out_at) continue
        const gap = new Date(sorted[i].checked_in_at).getTime() - new Date(sorted[i - 1].checked_out_at!).getTime()
        if (gap > 0) totalGapMs += gap
      }
    }

    const totalVisitMs = myVisits.reduce((sum, v) => {
      const end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : now
      return sum + Math.max(0, end - new Date(v.checked_in_at).getTime())
    }, 0)

    const sortedAttendance = [...myAttendance].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))
    const lastClockOuts = myAttendance.filter((a) => a.clock_out_at).sort((a, b) => b.clock_out_at!.localeCompare(a.clock_out_at!))

    return {
      userId: member.id,
      fullName: member.fullName,
      nickname: member.nickname ?? null,
      workingDays: workDayKeys.size,
      firstClockIn: sortedAttendance[0] ? formatTime(sortedAttendance[0].clock_in_at) : null,
      lastClockOut: lastClockOuts[0] ? formatTime(lastClockOuts[0].clock_out_at) : null,
      totalWorkingMs,
      visitCount: myVisits.length,
      totalVisitMs,
      avgVisitMs: myVisits.length > 0 ? totalVisitMs / myVisits.length : 0,
      totalGapMs,
      uniqueCustomers: new Set(myVisits.map((v) => v.customer_id).filter((id): id is string => !!id)).size,
      unassignedVisits: myVisits.filter((v) => !v.customer_id).length,
      autoCheckouts: myVisits.filter((v) => v.auto_closed).length,
      flaggedVisits: myVisits.filter((v) => v.flags && v.flags.length > 0).length,
    }
  })
}
