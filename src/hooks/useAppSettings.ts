import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
}

/** Live, super-admin-editable settings from `public.app_settings`. Falls
 * back to the hardcoded defaults in lib/config.ts if the row can't be read
 * yet -- see features/settings/SettingsPage.tsx for where these are edited. */
export function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('app_settings')
      .select(
        'checkin_radius_m, location_ping_interval_minutes, max_location_accuracy_m, auto_checkout_enabled, work_start_time, work_end_time, allow_early_clockin_minutes, auto_clockout_grace_minutes'
      )
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings({
          checkinRadiusM: data.checkin_radius_m,
          locationPingIntervalMinutes: data.location_ping_interval_minutes,
          maxLocationAccuracyM: data.max_location_accuracy_m,
          autoCheckoutEnabled: data.auto_checkout_enabled,
          workStartTime: data.work_start_time,
          workEndTime: data.work_end_time,
          allowEarlyClockinMinutes: data.allow_early_clockin_minutes,
          autoClockoutGraceMinutes: data.auto_clockout_grace_minutes,
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return settings
}
