import type { TeamMember } from '@/features/fleet/types'
import type { LeaveType } from '@/features/leave/types'
import { displayName } from '@/lib/displayName'
import type { AttendanceDay } from './attendanceSummary'

/** What needs attention for one person on one day. `notin`: today, on shift, nobody has seen them clock in yet. */
export type DetailKind = 'absent' | 'notin' | 'late' | 'leave' | 'dayoff'

export interface DetailItem {
  userId: string
  name: string
  department: string | null
  kind: DetailKind
  lateMinutes: number
  firstIn: string | null
  leaveType: LeaveType | null
  /** 1 for a full day, 0.5 for a half day. */
  leaveFraction: number
}

export interface DayDetail {
  day: string
  /** Set when the whole day is a public holiday and nobody was scheduled. */
  holiday: string | null
  counts: Record<DetailKind, number>
  /** People who clocked in on time (including those with half-day leave who did), by name. */
  onTime: { userId: string; name: string; department: string | null; firstIn: string | null }[]
  /** The people to look at, most urgent first. */
  items: DetailItem[]
}

const ORDER: Record<DetailKind, number> = { absent: 0, notin: 1, late: 2, leave: 3, dayoff: 4 }
const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

/**
 * One block per day, newest first: who was absent, late or on leave, and how
 * many were on time. Days nobody was scheduled (weekends, days still to come)
 * are left out; a public holiday keeps one line. For `today`, people on shift
 * whose start time has passed and who haven't clocked in show as "not in yet".
 * `nowHm` is the local time of day ("14:05").
 */
export function buildDayDetails(rows: AttendanceDay[], team: TeamMember[], days: string[], today: string, nowHm: string): DayDetail[] {
  const people = new Map(team.map((m) => [m.id, m]))
  const byDay = new Map<string, AttendanceDay[]>()
  for (const r of rows) {
    if (!people.has(r.userId)) continue
    const list = byDay.get(r.day) ?? []
    list.push(r)
    byDay.set(r.day, list)
  }

  const out: DayDetail[] = []
  for (const day of [...days].sort().reverse()) {
    const list = byDay.get(day) ?? []
    const counts: Record<DetailKind, number> = { absent: 0, notin: 0, late: 0, leave: 0, dayoff: 0 }
    const items: DetailItem[] = []
    const onTime: DayDetail['onTime'] = []
    let scheduled = false

    for (const r of list) {
      const m = people.get(r.userId)!
      const base = { userId: r.userId, name: displayName(m.fullName, m.nickname), department: m.departmentName, lateMinutes: 0, firstIn: r.firstIn, leaveType: r.leaveType, leaveFraction: r.leaveFraction }
      let kind: DetailKind | null = null
      if (r.status === 'absent') kind = day === today ? 'notin' : 'absent'
      else if (r.status === 'late') kind = 'late'
      else if (r.status === 'leave') kind = 'leave'
      else if (r.status === 'dayoff') kind = 'dayoff'
      else if (r.status === 'present') onTime.push({ userId: r.userId, name: base.name, department: base.department, firstIn: r.firstIn })
      else if (r.status === 'upcoming' && day === today && r.isWorking && !r.firstIn && r.scheduledStart && hm(r.scheduledStart) <= hm(nowHm)) kind = 'notin'
      if (r.status === 'present' || r.status === 'late' || r.status === 'absent' || r.status === 'leave' || r.status === 'dayoff' || kind === 'notin') scheduled = true
      if (kind) {
        counts[kind]++
        items.push({ ...base, kind, lateMinutes: kind === 'late' ? r.lateMinutes : 0 })
      }
    }

    if (!scheduled) {
      const holiday = list.find((r) => r.status === 'holiday')
      if (holiday) out.push({ day, holiday: holiday.holidayName ?? 'Public holiday', counts, onTime, items })
      continue
    }
    items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.lateMinutes - a.lateMinutes || a.name.localeCompare(b.name))
    onTime.sort((a, b) => a.name.localeCompare(b.name))
    out.push({ day, holiday: null, counts, onTime, items })
  }
  return out
}
