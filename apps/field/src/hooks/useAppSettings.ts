import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@footprints/shared/lib/supabase'
import { scheduleService } from '@/features/schedule/scheduleService'
import { flagRulesOf, type FirstVisitFarRule, type FlagRules, type IdleFarRule, type TravelRule } from '@/features/attendance/flagRules'
import {
  DEFAULT_ALLOW_EARLY_CLOCKIN_MINUTES,
  DEFAULT_AUTO_CHECKOUT_ENABLED,
  DEFAULT_AUTO_CLOCKOUT_GRACE_MINUTES,
  DEFAULT_CHECK_WINDOW_END,
  DEFAULT_CHECK_WINDOW_START,
  DEFAULT_FIRST_VISIT_DEADLINE,
  DEFAULT_FIRST_VISIT_FAR,
  DEFAULT_IDLE_FAR,
  DEFAULT_TRAVEL_DEDUCTION,
  DEFAULT_DAILY_UNIQUE_CUSTOMER_TARGET,
  DEFAULT_DAILY_ORDER_TARGET_USD,
  DEFAULT_DAILY_VISIT_TARGET,
  DEFAULT_FORGOTTEN_VISIT_CAP_MINUTES,
  DEFAULT_FULL_DAY_HOURS,
  DEFAULT_VISIT_CREDIT_CAP_MINUTES,
  DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES,
  DEFAULT_LATE_GRACE_MINUTES,
  DEFAULT_LUNCH_IDLE_THRESHOLD_MINUTES,
  DEFAULT_LUNCH_WINDOW_END,
  DEFAULT_LUNCH_WINDOW_START,
  DEFAULT_SHORT_VISIT_THRESHOLD_MINUTES,
  DEFAULT_LOCATION_PING_INTERVAL_MINUTES,
  DEFAULT_VISIT_RADIUS_METERS,
  DEFAULT_WORK_END_TIME,
  DEFAULT_WORK_START_TIME,
  MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
} from '@footprints/shared/lib/config'

export interface AppSettings {
  checkinRadiusM: number
  locationPingIntervalMinutes: number
  maxLocationAccuracyM: number
  autoCheckoutEnabled: boolean
  /** "HH:MM:SS", Asia/Phnom_Penh. */
  workStartTime: string
  workEndTime: string
  allowEarlyClockinMinutes: number
  autoClockoutGraceMinutes: number
  /** Minutes after the shift start before a clock-in counts as late. */
  lateGraceMinutes: number
  /** A gap between visits at least this long counts as idle (flagged). */
  idleAlertThresholdMinutes: number
  /** A completed visit shorter than this many minutes is a short (ineffective) visit. */
  shortVisitThresholdMinutes: number
  /** A gap overlapping the lunch window needs to be longer than this to be flagged idle; a first customer visit after the deadline is flagged; a forgotten visit counts at most the cap. */
  lunchWindowStart: string
  lunchWindowEnd: string
  lunchIdleThresholdMinutes: number
  firstVisitDeadline: string
  /** The distance rules (migration 0116): late first visit window, long-travel deduction, idle gaps by distance. */
  firstVisitFar: FirstVisitFarRule
  travel: TravelRule
  idleFar: IdleFarRule
  forgottenVisitCapMinutes: number
  /** A visit counts toward effectiveness for at most this many minutes; unique customers expected on a full day. */
  visitCreditCapMinutes: number
  dailyUniqueCustomerTarget: number
  /** Visits expected on a full day (the effectiveness score). */
  dailyVisitTarget: number
  /** Orders expected on a full day in USD, for people without their own target. */
  dailyOrderTargetUsd: number
  /** A full working day in hours (the unique-customer target scales by a day's hours against this). */
  dailyWorkingHours: number
  /** Customer check-in / check-out is only allowed between these times ("HH:MM:SS", Asia/Phnom_Penh). */
  checkWindowStart: string
  checkWindowEnd: string
  /** The signed-in person's unpaid break today (their schedule), for paid working time. */
  breakMinutes: number
  breakPaid: boolean
  /** Today is a working day for the signed-in person (their team schedule, minus public holidays). */
  isWorkingDay: boolean
  /** Today's public holiday, if any. */
  holidayName: string | null
}

/** The distance-rule columns of app_settings (migration 0116) as the rules the app applies; shared with the admin form. */
export function distanceRulesOf(d: {
  travel_deduction_enabled: boolean
  travel_deduction_min_km: number
  travel_deduction_step_km: number
  travel_deduction_minutes: number
  home_city_latitude: number
  home_city_longitude: number
  home_city_radius_km: number
  first_visit_far_enabled: boolean
  first_visit_far_km: number
  first_visit_far_extra_minutes: number
  idle_far_enabled: boolean
  idle_far_km: number
  idle_far_step_km: number
  idle_far_minutes_per_step: number
  idle_far_window_minutes: number
}): Pick<AppSettings, 'travel' | 'firstVisitFar' | 'idleFar'> {
  return {
    travel: {
      enabled: d.travel_deduction_enabled,
      minKm: d.travel_deduction_min_km,
      stepKm: d.travel_deduction_step_km,
      minutes: d.travel_deduction_minutes,
      homeLat: Number(d.home_city_latitude),
      homeLng: Number(d.home_city_longitude),
      homeRadiusKm: d.home_city_radius_km,
    },
    firstVisitFar: { enabled: d.first_visit_far_enabled, km: d.first_visit_far_km, extraMin: d.first_visit_far_extra_minutes },
    idleFar: { enabled: d.idle_far_enabled, km: d.idle_far_km, stepKm: d.idle_far_step_km, minPerStep: d.idle_far_minutes_per_step, windowMin: d.idle_far_window_minutes },
  }
}

const FALLBACK: AppSettings = {
  checkinRadiusM: DEFAULT_VISIT_RADIUS_METERS,
  locationPingIntervalMinutes: DEFAULT_LOCATION_PING_INTERVAL_MINUTES,
  maxLocationAccuracyM: MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
  autoCheckoutEnabled: DEFAULT_AUTO_CHECKOUT_ENABLED,
  workStartTime: DEFAULT_WORK_START_TIME,
  workEndTime: DEFAULT_WORK_END_TIME,
  allowEarlyClockinMinutes: DEFAULT_ALLOW_EARLY_CLOCKIN_MINUTES,
  autoClockoutGraceMinutes: DEFAULT_AUTO_CLOCKOUT_GRACE_MINUTES,
  lateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
  idleAlertThresholdMinutes: DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES,
  shortVisitThresholdMinutes: DEFAULT_SHORT_VISIT_THRESHOLD_MINUTES,
  lunchWindowStart: DEFAULT_LUNCH_WINDOW_START,
  lunchWindowEnd: DEFAULT_LUNCH_WINDOW_END,
  lunchIdleThresholdMinutes: DEFAULT_LUNCH_IDLE_THRESHOLD_MINUTES,
  firstVisitDeadline: DEFAULT_FIRST_VISIT_DEADLINE,
  firstVisitFar: { enabled: DEFAULT_FIRST_VISIT_FAR.enabled, km: DEFAULT_FIRST_VISIT_FAR.km, extraMin: DEFAULT_FIRST_VISIT_FAR.extraMinutes },
  travel: { ...DEFAULT_TRAVEL_DEDUCTION },
  idleFar: { enabled: DEFAULT_IDLE_FAR.enabled, km: DEFAULT_IDLE_FAR.km, stepKm: DEFAULT_IDLE_FAR.stepKm, minPerStep: DEFAULT_IDLE_FAR.minutesPerStep, windowMin: DEFAULT_IDLE_FAR.windowMinutes },
  forgottenVisitCapMinutes: DEFAULT_FORGOTTEN_VISIT_CAP_MINUTES,
  visitCreditCapMinutes: DEFAULT_VISIT_CREDIT_CAP_MINUTES,
  dailyUniqueCustomerTarget: DEFAULT_DAILY_UNIQUE_CUSTOMER_TARGET,
  dailyVisitTarget: DEFAULT_DAILY_VISIT_TARGET,
  dailyOrderTargetUsd: DEFAULT_DAILY_ORDER_TARGET_USD,
  dailyWorkingHours: DEFAULT_FULL_DAY_HOURS,
  checkWindowStart: DEFAULT_CHECK_WINDOW_START,
  checkWindowEnd: DEFAULT_CHECK_WINDOW_END,
  breakMinutes: 0,
  breakPaid: false,
  isWorkingDay: true,
  holidayName: null,
}

/** Live, super-admin-editable settings from `public.app_settings`. Falls
 * back to the hardcoded defaults in lib/config.ts if the row can't be read
 * yet -- see features/settings/SettingsPage.tsx for where these are edited. */
export function useAppSettings(): AppSettings & { flagRules: FlagRules } {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    // Set once the person's own day / clock window arrives, so the
    // company-wide values (which can land later) never overwrite them.
    let personal: Partial<Pick<AppSettings, 'workStartTime' | 'workEndTime' | 'allowEarlyClockinMinutes' | 'autoClockoutGraceMinutes' | 'breakMinutes' | 'breakPaid'>> | null = null
    supabase
      .from('app_settings')
      .select(
        'checkin_radius_m, location_ping_interval_minutes, max_location_accuracy_m, auto_checkout_enabled, work_start_time, work_end_time, allow_early_clockin_minutes, auto_clockout_grace_minutes, late_grace_minutes, idle_alert_threshold_minutes, short_visit_threshold_minutes'
      )
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings((prev) => ({
          ...prev,
          checkinRadiusM: data.checkin_radius_m,
          locationPingIntervalMinutes: data.location_ping_interval_minutes,
          maxLocationAccuracyM: data.max_location_accuracy_m,
          autoCheckoutEnabled: data.auto_checkout_enabled,
          workStartTime: data.work_start_time,
          workEndTime: data.work_end_time,
          allowEarlyClockinMinutes: data.allow_early_clockin_minutes,
          autoClockoutGraceMinutes: data.auto_clockout_grace_minutes,
          lateGraceMinutes: data.late_grace_minutes ?? DEFAULT_LATE_GRACE_MINUTES,
          idleAlertThresholdMinutes: data.idle_alert_threshold_minutes ?? DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES,
          shortVisitThresholdMinutes: data.short_visit_threshold_minutes ?? DEFAULT_SHORT_VISIT_THRESHOLD_MINUTES,
          ...(personal ?? {}),
        }))
      })
    // The check-in/out hours are read on their own: until migration 0110 adds the columns this
    // query simply fails, and the settings above (radius, accuracy, ...) must not be lost with it.
    supabase
      .from('app_settings')
      .select('check_window_start, check_window_end')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings((prev) => ({ ...prev, checkWindowStart: data.check_window_start, checkWindowEnd: data.check_window_end }))
      })
    // The flag-rule settings (migration 0111), read on their own for the same reason.
    supabase
      .from('app_settings')
      .select('first_visit_deadline, lunch_window_start, lunch_window_end, lunch_idle_threshold_minutes, forgotten_visit_cap_minutes')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings((prev) => ({
          ...prev,
          firstVisitDeadline: data.first_visit_deadline,
          lunchWindowStart: data.lunch_window_start,
          lunchWindowEnd: data.lunch_window_end,
          lunchIdleThresholdMinutes: data.lunch_idle_threshold_minutes,
          forgottenVisitCapMinutes: data.forgotten_visit_cap_minutes,
        }))
      })
    // The effectiveness settings (migration 0112), read on their own for the same reason.
    supabase
      .from('app_settings')
      .select('visit_credit_cap_minutes, daily_unique_customer_target, daily_working_hours, daily_visit_target')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings((prev) => ({
          ...prev,
          visitCreditCapMinutes: data.visit_credit_cap_minutes,
          dailyUniqueCustomerTarget: data.daily_unique_customer_target,
          dailyVisitTarget: data.daily_visit_target ?? DEFAULT_DAILY_VISIT_TARGET,
          dailyWorkingHours: Number(data.daily_working_hours) || DEFAULT_FULL_DAY_HOURS,
        }))
      })
    // The daily order target (migration 0118), read on its own for the same reason.
    supabase
      .from('app_settings')
      .select('daily_order_target_usd')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings((prev) => ({ ...prev, dailyOrderTargetUsd: Number(data.daily_order_target_usd) }))
      })
    // The distance rules (migration 0116), read on their own for the same reason.
    supabase
      .from('app_settings')
      .select('travel_deduction_enabled, travel_deduction_min_km, travel_deduction_step_km, travel_deduction_minutes, home_city_latitude, home_city_longitude, home_city_radius_km, first_visit_far_enabled, first_visit_far_km, first_visit_far_extra_minutes, idle_far_enabled, idle_far_km, idle_far_step_km, idle_far_minutes_per_step, idle_far_window_minutes')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings((prev) => ({ ...prev, ...distanceRulesOf(data) }))
      })
    // The signed-in person's own hours today (team schedule or company
    // schedule, minus holidays -- app.work_day). Overrides the company-wide
    // times above so the clock-in window and shift chip match what the
    // server enforces for them.
    scheduleService
      .myWorkDay()
      .then((day) => {
        if (cancelled || !day) return
        personal = { ...personal, workStartTime: day.start, workEndTime: day.end, breakMinutes: day.breakMinutes, breakPaid: day.breakPaid }
        setSettings((prev) => ({ ...prev, ...personal, isWorkingDay: day.isWorking, holidayName: day.holidayName }))
      })
      .catch(() => {
        // Keep the company-wide times.
      })
    // The person's own early clock-in / auto clock-out minutes -- an admin
    // can override the company's per person (app.clock_window).
    scheduleService
      .myClockWindow()
      .then((w) => {
        if (cancelled || !w) return
        personal = { ...personal, ...w }
        setSettings((prev) => ({ ...prev, ...personal }))
      })
      .catch(() => {
        // Keep the company-wide minutes.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const flagRules = useMemo(() => flagRulesOf(settings), [settings])
  return useMemo(() => ({ ...settings, flagRules }), [settings, flagRules])
}
