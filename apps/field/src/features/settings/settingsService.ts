import { supabase } from '@footprints/shared/lib/supabase'
import { DEFAULT_DAILY_VISIT_TARGET } from '@footprints/shared/lib/config'
import { distanceRulesOf } from '@/hooks/useAppSettings'
import type { FirstVisitFarRule, IdleFarRule, TravelRule } from '@/features/attendance/flagRules'

/** The global settings a super admin can edit here. Working hours, clock-in
 * rules and leave defaults live on their own screens (Working hours & days,
 * Leave allowances) and are deliberately not read or written by this form,
 * so saving one screen never overwrites the other. Currency and visit/hour
 * targets are left untouched too. */
export interface EditableSettings {
  checkinRadiusM: number
  locationPingIntervalMinutes: number
  autoCheckoutEnabled: boolean
  /** Minutes clocked in with no open visit before an "idling too long" notification fires. */
  idleAlertThresholdMinutes: number
  /** Minutes; a completed visit shorter than this triggers an "ineffective visit" notification. */
  shortVisitThresholdMinutes: number
  /** GPS readings less accurate than this are rejected for clock-in and check-in (clock-out only flags it). */
  maxLocationAccuracyM: number
  /** Customer check-in / check-out is only allowed between these times ("HH:MM", Asia/Phnom_Penh). */
  checkWindowStart: string
  checkWindowEnd: string
  /** A first customer visit of the day after this time is flagged ("HH:MM"). */
  firstVisitDeadline: string
  /** A gap overlapping this window needs to be longer than lunchIdleThresholdMinutes to be flagged idle. */
  lunchWindowStart: string
  lunchWindowEnd: string
  lunchIdleThresholdMinutes: number
  /** The distance rules: long travel outside the home city, the far first visit window, idle gaps by distance. */
  travel: TravelRule
  firstVisitFar: FirstVisitFarRule
  idleFar: IdleFarRule
  /** A visit nobody checked out of counts at most this many minutes. */
  forgottenVisitCapMinutes: number
  /** A visit counts toward effectiveness for at most this many minutes. */
  visitCreditCapMinutes: number
  /** Unique customers expected on a full working day. */
  dailyUniqueCustomerTarget: number
  /** Visits expected on a full working day (the effectiveness score). */
  dailyVisitTarget: number
  /** The monthly sales target in USD for people without their own; 0 means none. */
  monthlyOrderTargetUsd: number
}

/**
 * Reads and writes the single global `app_settings` row. RLS is the real
 * gate (`app_settings_update` requires the `settings:edit` permission,
 * granted only to the System Admin role) -- SettingsPage only checks the
 * caller's role client-side so non-admins never see the form at all.
 */
export const settingsService = {
  async get(): Promise<EditableSettings> {
    const { data, error } = await supabase
      .from('app_settings')
      .select(
        'checkin_radius_m, location_ping_interval_minutes, auto_checkout_enabled, idle_alert_threshold_minutes, short_visit_threshold_minutes, max_location_accuracy_m, check_window_start, check_window_end, first_visit_deadline, lunch_window_start, lunch_window_end, lunch_idle_threshold_minutes, forgotten_visit_cap_minutes, visit_credit_cap_minutes, daily_unique_customer_target, daily_visit_target, monthly_order_target_usd, travel_deduction_enabled, travel_deduction_min_km, travel_deduction_step_km, travel_deduction_minutes, home_city_latitude, home_city_longitude, home_city_radius_km, first_visit_far_enabled, first_visit_far_km, first_visit_far_extra_minutes, idle_far_enabled, idle_far_km, idle_far_step_km, idle_far_minutes_per_step, idle_far_window_minutes'
      )
      .single()
    if (error) throw error
    return {
      checkinRadiusM: data.checkin_radius_m,
      locationPingIntervalMinutes: data.location_ping_interval_minutes,
      autoCheckoutEnabled: data.auto_checkout_enabled,
      idleAlertThresholdMinutes: data.idle_alert_threshold_minutes,
      shortVisitThresholdMinutes: data.short_visit_threshold_minutes,
      maxLocationAccuracyM: data.max_location_accuracy_m,
      checkWindowStart: data.check_window_start.slice(0, 5),
      checkWindowEnd: data.check_window_end.slice(0, 5),
      firstVisitDeadline: data.first_visit_deadline.slice(0, 5),
      lunchWindowStart: data.lunch_window_start.slice(0, 5),
      lunchWindowEnd: data.lunch_window_end.slice(0, 5),
      lunchIdleThresholdMinutes: data.lunch_idle_threshold_minutes,
      forgottenVisitCapMinutes: data.forgotten_visit_cap_minutes,
      visitCreditCapMinutes: data.visit_credit_cap_minutes,
      dailyUniqueCustomerTarget: data.daily_unique_customer_target,
      dailyVisitTarget: data.daily_visit_target ?? DEFAULT_DAILY_VISIT_TARGET,
      monthlyOrderTargetUsd: Number(data.monthly_order_target_usd),
      ...distanceRulesOf(data),
    }
  },

  async update(settings: EditableSettings): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .update({
        checkin_radius_m: settings.checkinRadiusM,
        location_ping_interval_minutes: settings.locationPingIntervalMinutes,
        auto_checkout_enabled: settings.autoCheckoutEnabled,
        idle_alert_threshold_minutes: settings.idleAlertThresholdMinutes,
        short_visit_threshold_minutes: settings.shortVisitThresholdMinutes,
        max_location_accuracy_m: settings.maxLocationAccuracyM,
        check_window_start: settings.checkWindowStart,
        check_window_end: settings.checkWindowEnd,
        first_visit_deadline: settings.firstVisitDeadline,
        lunch_window_start: settings.lunchWindowStart,
        lunch_window_end: settings.lunchWindowEnd,
        lunch_idle_threshold_minutes: settings.lunchIdleThresholdMinutes,
        forgotten_visit_cap_minutes: settings.forgottenVisitCapMinutes,
        visit_credit_cap_minutes: settings.visitCreditCapMinutes,
        daily_unique_customer_target: settings.dailyUniqueCustomerTarget,
        daily_visit_target: settings.dailyVisitTarget,
        monthly_order_target_usd: settings.monthlyOrderTargetUsd,
        travel_deduction_enabled: settings.travel.enabled,
        travel_deduction_min_km: settings.travel.minKm,
        travel_deduction_step_km: settings.travel.stepKm,
        travel_deduction_minutes: settings.travel.minutes,
        home_city_latitude: settings.travel.homeLat,
        home_city_longitude: settings.travel.homeLng,
        home_city_radius_km: settings.travel.homeRadiusKm,
        first_visit_far_enabled: settings.firstVisitFar.enabled,
        first_visit_far_km: settings.firstVisitFar.km,
        first_visit_far_extra_minutes: settings.firstVisitFar.extraMin,
        idle_far_enabled: settings.idleFar.enabled,
        idle_far_km: settings.idleFar.km,
        idle_far_step_km: settings.idleFar.stepKm,
        idle_far_minutes_per_step: settings.idleFar.minPerStep,
        idle_far_window_minutes: settings.idleFar.windowMin,
      })
      .eq('id', true)
    if (error) throw error
  },
}
