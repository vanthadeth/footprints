import type { TeamMember } from '@/features/fleet/types'
import { buildDayDetails, type DetailItem } from './attendanceDetails'
import { teamKpis, totalsByPerson, type AttendanceDay } from './attendanceSummary'

/** One day of the week for the Hub card: how many people were late, absent or on leave (or a flexible day off). */
export interface HubDay {
  day: string
  late: number
  absent: number
  leave: number
  /** Somebody was scheduled this day (false for weekends, holidays and days still to come). */
  scheduled: boolean
}

export interface HubSummary {
  /** 0–1, or null when nothing was scheduled yet. */
  rate: number | null
  present: number
  scheduled: number
  late: number
  lateMinutes: number
  absent: number
  leaveDays: number
  perDay: HubDay[]
  /** Who needs a look today, most urgent first (absent, not in yet, late, leave). */
  todayItems: DetailItem[]
}

/**
 * The week at a glance for the Hub's attendance card, from rows already loaded.
 * Numbers use the same rules as the Weekly attendance view and the Attendance page.
 * `days` are the week's dates, oldest first; `nowHm` is the local time of day ("14:05").
 */
export function buildHubSummary(rows: AttendanceDay[], team: TeamMember[], days: string[], today: string, nowHm: string): HubSummary {
  const ids = new Set(team.map((m) => m.id))
  const mine = rows.filter((r) => ids.has(r.userId))
  const k = teamKpis(totalsByPerson(mine).values())
  const details = new Map(buildDayDetails(mine, team, days, today, nowHm).map((d) => [d.day, d]))
  const perDay = days.map((day): HubDay => {
    const d = details.get(day)
    return { day, late: d?.counts.late ?? 0, absent: d?.counts.absent ?? 0, leave: (d?.counts.leave ?? 0) + (d?.counts.dayoff ?? 0), scheduled: !!d && !d.holiday }
  })
  return {
    rate: k.rate,
    present: k.present,
    scheduled: k.scheduled,
    late: k.late,
    lateMinutes: k.lateMinutes,
    absent: k.absent,
    leaveDays: k.leaveDays,
    perDay,
    todayItems: details.get(today)?.items ?? [],
  }
}
