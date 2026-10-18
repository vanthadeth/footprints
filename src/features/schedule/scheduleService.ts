import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/rpc'
import type { DaySchedule } from './schedule'

export interface WorkSchedule {
  id: string
  /** null = the company schedule. */
  departmentId: string | null
  breakPaid: boolean
  days: DaySchedule[]
}

export interface ClockRules {
  allowEarlyClockinMinutes: number
  lateGraceMinutes: number
  autoClockoutGraceMinutes: number
  lateClockinThresholdMinutes: number
}

/** A person's early clock-in / auto clock-out override (null = the company setting), next to the company setting. */
export interface UserClockWindow {
  allowEarlyClockinMinutes: number | null
  autoClockoutGraceMinutes: number | null
  companyEarlyClockinMinutes: number
  companyAutoClockoutGraceMinutes: number
}

export interface MyWorkDay {
  isWorking: boolean
  holidayName: string | null
  holidayHalf: boolean
  start: string
  end: string
  teamSchedule: boolean
}

const hhmm = (t: string) => t.slice(0, 5)

/**
 * Working hours & days (0089): the company schedule plus team overrides,
 * and the clock-in rules that live on app_settings. RLS decides who may
 * write (settings:edit) -- the page only hides the controls from others.
 */
export const scheduleService = {
  async list(): Promise<WorkSchedule[]> {
    const { data, error } = await supabase
      .from('work_schedules')
      .select('id, department_id, break_paid, work_schedule_days(iso_dow, is_working, start_time, end_time, break_minutes)')
    if (error) throw error
    return (data ?? []).map((s) => ({
      id: s.id,
      departmentId: s.department_id,
      breakPaid: s.break_paid,
      days: [...(s.work_schedule_days ?? [])]
        .sort((a, b) => a.iso_dow - b.iso_dow)
        .map((d) => ({ isoDow: d.iso_dow, isWorking: d.is_working, start: hhmm(d.start_time), end: hhmm(d.end_time), breakMinutes: d.break_minutes })),
    }))
  },

  async save(departmentId: string | null, breakPaid: boolean, days: DaySchedule[]): Promise<void> {
    const { error } = await supabase.rpc('save_work_schedule', {
      p_department: departmentId as string,
      p_break_paid: breakPaid,
      p_days: days.map((d) => ({ iso_dow: d.isoDow, is_working: d.isWorking, start_time: d.start, end_time: d.end, break_minutes: d.breakMinutes })),
    })
    if (error) throw error
  },

  async removeTeam(departmentId: string): Promise<void> {
    const { error } = await supabase.from('work_schedules').delete().eq('department_id', departmentId)
    if (error) throw error
  },

  async rules(): Promise<ClockRules> {
    const { data, error } = await supabase
      .from('app_settings')
      .select('allow_early_clockin_minutes, late_grace_minutes, auto_clockout_grace_minutes, late_clockin_threshold_minutes')
      .single()
    if (error) throw error
    return {
      allowEarlyClockinMinutes: data.allow_early_clockin_minutes,
      lateGraceMinutes: data.late_grace_minutes,
      autoClockoutGraceMinutes: data.auto_clockout_grace_minutes,
      lateClockinThresholdMinutes: data.late_clockin_threshold_minutes,
    }
  },

  async saveRules(rules: ClockRules): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .update({
        allow_early_clockin_minutes: rules.allowEarlyClockinMinutes,
        late_grace_minutes: rules.lateGraceMinutes,
        auto_clockout_grace_minutes: rules.autoClockoutGraceMinutes,
        late_clockin_threshold_minutes: rules.lateClockinThresholdMinutes,
      })
      .eq('id', true)
    if (error) throw error
  },

  async myWorkDay(date?: string): Promise<MyWorkDay | null> {
    const rows = await callRpc<{ is_working: boolean; holiday_name: string | null; holiday_half: boolean; start_time: string; end_time: string; team_schedule: boolean }[]>(
      'my_work_day',
      date ? { p_date: date } : {}
    )
    const r = rows?.[0]
    if (!r) return null
    return { isWorking: r.is_working, holidayName: r.holiday_name, holidayHalf: r.holiday_half, start: hhmm(r.start_time), end: hhmm(r.end_time), teamSchedule: r.team_schedule }
  },
  /** The signed-in person's own early clock-in and auto clock-out minutes (their override, else the company's). */
  async myClockWindow(): Promise<{ allowEarlyClockinMinutes: number; autoClockoutGraceMinutes: number } | null> {
    const rows = await callRpc<{ allow_early_clockin_minutes: number; auto_clockout_grace_minutes: number }[]>('my_clock_window')
    const r = rows?.[0]
    if (!r) return null
    return { allowEarlyClockinMinutes: r.allow_early_clockin_minutes, autoClockoutGraceMinutes: r.auto_clockout_grace_minutes }
  },

  async userClockWindow(userId: string): Promise<UserClockWindow | null> {
    const rows = await callRpc<
      { allow_early_clockin_minutes: number | null; auto_clockout_grace_minutes: number | null; company_early_clockin_minutes: number; company_clockout_grace_minutes: number }[]
    >('user_clock_window', { p_user: userId })
    const r = rows?.[0]
    if (!r) return null
    return {
      allowEarlyClockinMinutes: r.allow_early_clockin_minutes,
      autoClockoutGraceMinutes: r.auto_clockout_grace_minutes,
      companyEarlyClockinMinutes: r.company_early_clockin_minutes,
      companyAutoClockoutGraceMinutes: r.company_clockout_grace_minutes,
    }
  },

  /** null = follow the company setting; both null removes the override. Needs user:edit for that person. */
  async setUserClockWindow(userId: string, earlyMinutes: number | null, graceMinutes: number | null): Promise<void> {
    await callRpc<null>('set_user_clock_window', { p_user: userId, p_early: earlyMinutes, p_grace: graceMinutes })
  },
}
