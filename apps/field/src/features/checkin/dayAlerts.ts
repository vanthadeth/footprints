import { firstVisitStatus, type FirstVisitFarRule } from '@/features/attendance/flagRules'
import { firstVisitDistanceM } from '@/features/attendance/effectivenessScore'
import { isLateClockIn } from '@/features/attendance/efficiency'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

export interface DayAlert {
  id: 'late_in' | 'early_out' | 'late_first_visit' | 'no_first_visit'
  tone: 'warn' | 'danger'
  /** An i18n key under checkIn.* for the whole line, and the values it takes. */
  title: string
  params: Record<string, string | number>
}

const localMs = (day: string, hm: string) => new Date(`${day}T${hm.slice(0, 5)}:00+07:00`).getTime()

/**
 * What to put in front of the person on the Check in page about today: they clocked in
 * late, clocked out before the end of the shift, their first customer visit was late, or
 * it's past the first-visit deadline with no visit yet. All judged by the same rules the
 * effectiveness score and the Footprints report use, so the page never disagrees with them.
 */
export function dayAlerts(i: {
  day: string
  now: number
  attendance: AttendanceRow[]
  visits: VisitRow[]
  workStart: string
  workEnd: string
  graceMin: number
  firstVisitDeadline: string
  firstVisitFar?: FirstVisitFarRule
  /** Formats an instant as a clock time ("08:23"). */
  clock: (ms: number) => string
}): DayAlert[] {
  const out: DayAlert[] = []
  if (i.attendance.length === 0) return out
  const end = localMs(i.day, i.workEnd)

  if (isLateClockIn(i.attendance, i.day, { start: i.workStart }, i.graceMin)) {
    const first = Math.min(...i.attendance.map((s) => new Date(s.clock_in_at).getTime()))
    out.push({ id: 'late_in', tone: 'warn', title: 'checkIn.alertLateIn', params: { time: i.clock(first) } })
  }

  const closed = i.attendance.filter((s) => s.clock_out_at)
  const open = i.attendance.some((s) => !s.clock_out_at)
  if (!open && closed.length > 0) {
    const last = Math.max(...closed.map((s) => new Date(s.clock_out_at as string).getTime()))
    if (last < end - 60_000 || closed.some((s) => s.flags?.includes('EARLY_CLOCK_OUT'))) {
      out.push({ id: 'early_out', tone: 'warn', title: 'checkIn.alertEarlyOut', params: { time: i.clock(last) } })
    }
  }

  const fv = firstVisitStatus(i.visits, true, i.day, i.firstVisitDeadline, i.now, i.firstVisitFar, firstVisitDistanceM(i.attendance, i.visits))
  if (fv.kind === 'late') {
    out.push({ id: 'late_first_visit', tone: 'warn', title: 'checkIn.alertLateFirstVisit', params: { time: i.clock(fv.at) } })
  } else if (fv.kind === 'none' && open) {
    out.push({ id: 'no_first_visit', tone: 'danger', title: 'checkIn.alertNoFirstVisit', params: { deadline: i.firstVisitDeadline.slice(0, 5) } })
  }
  return out
}
