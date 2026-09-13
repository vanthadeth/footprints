/**
 * Centralised, business-rule configuration.
 *
 * These are fallback defaults used only until `useAppSettings()` loads the
 * live row from `public.app_settings` (which an admin can edit). Never
 * duplicate these numbers elsewhere -- read them from here, or from the
 * settings hook once the app is authenticated.
 */

/** Business day timezone for all reporting, gap, and "today" calculations. */
export const APP_TIMEZONE = 'Asia/Phnom_Penh'

/**
 * Visit radius in metres. NOT a Check In restriction -- used only to
 * monitor an already-started visit and to flag/trigger auto check-out.
 * The live value lives in app_settings.checkin_radius_m.
 */
export const DEFAULT_VISIT_RADIUS_METERS = 100

/** How often to record a location ping while a visit is active. */
export const DEFAULT_LOCATION_PING_INTERVAL_MINUTES = 5

/**
 * GPS accuracy (metres) above which a reading is flagged LOW_LOCATION_ACCURACY.
 * This never blocks an action -- it only attaches a flag for review.
 */
export const MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS = 100

/** The only geofence radii a super admin can choose between (spec). */
export const ALLOWED_CHECKIN_RADII_METERS = [50, 100, 300] as const

/** Whether a visit auto-checks-out when the user moves outside the geofence. */
export const DEFAULT_AUTO_CHECKOUT_ENABLED = true

/** Working-hour window (Asia/Phnom_Penh), "HH:MM". */
export const DEFAULT_WORK_START_TIME = '08:00'
export const DEFAULT_WORK_END_TIME = '17:00'

/** How many minutes before work_start_time a clock-in is still allowed. */
export const DEFAULT_ALLOW_EARLY_CLOCKIN_MINUTES = 15

/** How many minutes after work_end_time before an open attendance is auto clocked out. */
export const DEFAULT_AUTO_CLOCKOUT_GRACE_MINUTES = 60

/** Standardised flags used across attendance, visits, fleet, and reports. */
export const FLAGS = {
  UNASSIGNED_VISIT: 'UNASSIGNED_VISIT',
  LOW_LOCATION_ACCURACY: 'LOW_LOCATION_ACCURACY',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'AUTO_CHECKOUT_OUTSIDE_RADIUS',
  AUTO_CHECKOUT_CLOCK_OUT: 'AUTO_CHECKOUT_CLOCK_OUT',
  AUTO_CHECKOUT_WORKING_HOURS_END: 'AUTO_CHECKOUT_WORKING_HOURS_END',
  TRACKING_INTERRUPTED: 'TRACKING_INTERRUPTED',
} as const

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS]

/** Selfie capture constraints (client-side compression target). */
export const SELFIE_MAX_DIMENSION_PX = 720
export const SELFIE_JPEG_QUALITY = 0.7
