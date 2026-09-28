import { callRpc } from '@/lib/rpc'
import type { AttendanceDay, DayStatus } from './attendanceSummary'
import type { LeaveType } from '@/features/leave/types'

type Row = {
  user_id: string
  day: string
  status: DayStatus
  is_working: boolean
  scheduled_start: string | null
  scheduled_end: string | null
  late_minutes: number | null
  worked_minutes: number | null
  first_in: string | null
  last_out: string | null
  leave_type: LeaveType | null
  leave_fraction: number | string | null
  holiday_name: string | null
}

export interface AttendanceSettings {
  lateGraceMinutes: number
  /** 1–28, or 0 for the calendar month. */
  cycleCloseDay: number
}

/** The per-day attendance feed (app.attendance_days, 0091) behind the weekly and monthly summaries. At most 62 days per call. */
export const summaryService = {
  async days(from: string, to: string): Promise<AttendanceDay[]> {
    const rows = await callRpc<Row[]>('attendance_days', { p_from: from, p_to: to })
    return (rows ?? []).map((r) => ({
      userId: r.user_id,
      day: r.day,
      status: r.status,
      isWorking: r.is_working,
      scheduledStart: r.scheduled_start?.slice(0, 5) ?? null,
      scheduledEnd: r.scheduled_end?.slice(0, 5) ?? null,
      lateMinutes: r.late_minutes ?? 0,
      workedMinutes: r.worked_minutes ?? 0,
      firstIn: r.first_in,
      lastOut: r.last_out,
      leaveType: r.leave_type,
      leaveFraction: Number(r.leave_fraction ?? 0),
      holidayName: r.holiday_name,
    }))
  },

  async settings(): Promise<AttendanceSettings> {
    const rows = await callRpc<{ late_grace_minutes: number; attendance_cycle_close_day: number }[]>('attendance_settings')
    const r = rows?.[0]
    return { lateGraceMinutes: r?.late_grace_minutes ?? 5, cycleCloseDay: r?.attendance_cycle_close_day ?? 20 }
  },

  async setCycleCloseDay(day: number): Promise<void> {
    await callRpc<null>('set_attendance_cycle', { p_close_day: day })
  },
}
