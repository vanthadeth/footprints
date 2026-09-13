import { supabase } from '@/lib/supabase'

/** The global settings a super admin can edit (spec). Everything else on
 * `app_settings` (currency, visit/hour targets) belongs to a different
 * screen and is left untouched here. */
export interface EditableSettings {
  checkinRadiusM: number
  locationPingIntervalMinutes: number
  autoCheckoutEnabled: boolean
  /** "HH:MM". */
  workStartTime: string
  workEndTime: string
  allowEarlyClockinMinutes: number
  autoClockoutGraceMinutes: number
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
      .select('checkin_radius_m, location_ping_interval_minutes, auto_checkout_enabled, work_start_time, work_end_time, allow_early_clockin_minutes, auto_clockout_grace_minutes')
      .single()
    if (error) throw error
    return {
      checkinRadiusM: data.checkin_radius_m,
      locationPingIntervalMinutes: data.location_ping_interval_minutes,
      autoCheckoutEnabled: data.auto_checkout_enabled,
      // Postgres `time` comes back as "HH:MM:SS" -- trim to "HH:MM" for <input type="time">.
      workStartTime: data.work_start_time.slice(0, 5),
      workEndTime: data.work_end_time.slice(0, 5),
      allowEarlyClockinMinutes: data.allow_early_clockin_minutes,
      autoClockoutGraceMinutes: data.auto_clockout_grace_minutes,
    }
  },

  async update(settings: EditableSettings): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .update({
        checkin_radius_m: settings.checkinRadiusM,
        location_ping_interval_minutes: settings.locationPingIntervalMinutes,
        auto_checkout_enabled: settings.autoCheckoutEnabled,
        work_start_time: settings.workStartTime,
        work_end_time: settings.workEndTime,
        allow_early_clockin_minutes: settings.allowEarlyClockinMinutes,
        auto_clockout_grace_minutes: settings.autoClockoutGraceMinutes,
      })
      .eq('id', true)
    if (error) throw error
  },
}
