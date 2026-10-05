import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { scheduleService } from '@/features/schedule/scheduleService'
import {
  DEFAULT_ALLOW_EARLY_CLOCKIN_MINUTES,
  DEFAULT_AUTO_CHECKOUT_ENABLED,
  DEFAULT_AUTO_CLOCKOUT_GRACE_MINUTES,
  DEFAULT_LOCATION_PING_INTERVAL_MINUTES,
  DEFAULT_VISIT_RADIUS_METERS,
  DEFAULT_WORK_END_TIME,
  DEFAULT_WORK_START_TIME,
  MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
} from '@/lib/config'

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
  /** Today is a working day for the signed-in person (their team schedule, minus public holidays). */
  isWorkingDay: boolean
  /** Today's public holiday, if any. */
  holidayName: string | null
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
  lateGraceMinutes: 0,
  isWorkingDay: true,
  holidayName: null,
}

/** Live, super-admin-editable settings from `public.app_settings`. Falls
 * back to the hardcoded defaults in lib/config.ts if the row can't be read
 * yet -- see features/settings/SettingsPage.tsx for where these are edited. */
export function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    // Set once the person's own day arrives, so the company-wide times
    // (which can land later) never overwrite it.
    let personal: { workStartTime: string; workEndTime: string } | null = null
    supabase
      .from('app_settings')
      .select(
        'checkin_radius_m, location_ping_interval_minutes, max_location_accuracy_m, auto_checkout_enabled, work_start_time, work_end_time, allow_early_clockin_minutes, auto_clockout_grace_minutes, late_grace_minutes'
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
          lateGraceMinutes: data.late_grace_minutes ?? 0,
          ...(personal ?? {}),
        }))
      })
    // The signed-in person's own hours today (team schedule or company
    // schedule, minus holidays -- app.work_day). Overrides the company-wide
    // times above so the clock-in window and shift chip match what the
    // server enforces for them.
    scheduleService
      .myWorkDay()
      .then((day) => {
        if (cancelled || !day) return
        personal = { workStartTime: day.start, workEndTime: day.end }
        setSettings((prev) => ({ ...prev, ...personal, isWorkingDay: day.isWorking, holidayName: day.holidayName }))
      })
      .catch(() => {
        // Keep the company-wide times.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return settings
}
