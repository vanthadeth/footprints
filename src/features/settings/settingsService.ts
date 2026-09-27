import { supabase } from '@/lib/supabase'

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
        'checkin_radius_m, location_ping_interval_minutes, auto_checkout_enabled, idle_alert_threshold_minutes, short_visit_threshold_minutes'
      )
      .single()
    if (error) throw error
    return {
      checkinRadiusM: data.checkin_radius_m,
      locationPingIntervalMinutes: data.location_ping_interval_minutes,
      autoCheckoutEnabled: data.auto_checkout_enabled,
      idleAlertThresholdMinutes: data.idle_alert_threshold_minutes,
      shortVisitThresholdMinutes: data.short_visit_threshold_minutes,
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
      })
      .eq('id', true)
    if (error) throw error
  },
}
