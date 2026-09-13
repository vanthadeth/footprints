import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_LOCATION_PING_INTERVAL_MINUTES,
  DEFAULT_VISIT_RADIUS_METERS,
  MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
} from '@/lib/config'

export interface AppSettings {
  checkinRadiusM: number
  locationPingIntervalMinutes: number
  maxLocationAccuracyM: number
}

const FALLBACK: AppSettings = {
  checkinRadiusM: DEFAULT_VISIT_RADIUS_METERS,
  locationPingIntervalMinutes: DEFAULT_LOCATION_PING_INTERVAL_MINUTES,
  maxLocationAccuracyM: MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
}

/** Live, admin-editable settings from `public.app_settings`. Falls back to
 * the hardcoded defaults in lib/config.ts if the row can't be read yet. */
export function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('app_settings')
      .select('checkin_radius_m, location_ping_interval_minutes, max_location_accuracy_m')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setSettings({
          checkinRadiusM: data.checkin_radius_m,
          locationPingIntervalMinutes: data.location_ping_interval_minutes,
          maxLocationAccuracyM: data.max_location_accuracy_m,
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return settings
}
