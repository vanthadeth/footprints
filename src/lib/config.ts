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
 * GPS accuracy (metres) above which a reading counts as low accuracy
 * (app_settings.max_location_accuracy_m). Clock-in and customer check-in need a
 * fix at least this good; clock-out only flags it (LOW_LOCATION_ACCURACY), and a
 * low-accuracy GPS ping never triggers an automatic check-out.
 */
export const MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS = 100

/** The only geofence radii a super admin can choose between (spec). */
export const ALLOWED_CHECKIN_RADII_METERS = [50, 100, 300] as const

/** The only location ping frequencies a super admin can choose between (spec). */
export const ALLOWED_LOCATION_PING_MINUTES = [1, 2, 5] as const

/** Whether a visit auto-checks-out when the user moves outside the geofence. */
export const DEFAULT_AUTO_CHECKOUT_ENABLED = true

/** Working-hour window (Asia/Phnom_Penh), "HH:MM". */
export const DEFAULT_WORK_START_TIME = '08:00'
export const DEFAULT_WORK_END_TIME = '17:00'

/** Until the live setting loads: a completed visit shorter than this is a short (ineffective) visit (app_settings.short_visit_threshold_minutes). */
export const DEFAULT_SHORT_VISIT_THRESHOLD_MINUTES = 2

/** Until the live setting loads: customer check-in / check-out is allowed between these times (app_settings.check_window_start / check_window_end). */
export const DEFAULT_CHECK_WINDOW_START = '07:00:00'
export const DEFAULT_CHECK_WINDOW_END = '20:00:00'

/** How many minutes before work_start_time a clock-in is still allowed. */
export const DEFAULT_ALLOW_EARLY_CLOCKIN_MINUTES = 15

/** How many minutes after work_end_time before an open attendance is auto clocked out. */
export const DEFAULT_AUTO_CLOCKOUT_GRACE_MINUTES = 60

/**
 * Until the live settings load: the flag rules (app_settings). After a person's
 * first customer visit, a gap -- between two visits, or from the last check-out
 * to clock-out or now -- is flagged once it is longer than the idle threshold
 * (idle_alert_threshold_minutes); a gap overlapping the lunch window needs to
 * be longer than the lunch threshold. One rule for the manager alert, the day
 * bar, the Footprints timeline, the team map and the reports.
 */
export const DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES = 45
export const DEFAULT_LUNCH_WINDOW_START = '11:00:00'
export const DEFAULT_LUNCH_WINDOW_END = '14:00:00'
export const DEFAULT_LUNCH_IDLE_THRESHOLD_MINUTES = 90

/** A first customer visit of the day after this time is flagged LATE_FIRST_VISIT (app_settings.first_visit_deadline). */
export const DEFAULT_FIRST_VISIT_DEADLINE = '10:00:00'

/** A visit nobody checked out of (closed by clock-out or at the end of the day) counts at most this long (app_settings.forgotten_visit_cap_minutes). */
export const DEFAULT_FORGOTTEN_VISIT_CAP_MINUTES = 30

/** A visit marked "ordered" is provisional until a synced sale order confirms it: from the visit's day to this many days after (public.visit_orders). */
export const ORDER_RECONCILE_DAYS = 2

/** A visit counts toward effectiveness for at most this many minutes (app_settings.visit_credit_cap_minutes). */
export const DEFAULT_VISIT_CREDIT_CAP_MINUTES = 45
/** Visits expected on a full working day, for the effectiveness score (app_settings.daily_visit_target). */
export const DEFAULT_DAILY_VISIT_TARGET = 8
/** Orders expected on a full working day, in USD, for people without their own target (app_settings.daily_order_target_usd). */
export const DEFAULT_DAILY_ORDER_TARGET_USD = 300
/** The effectiveness score: a visit that doesn't count (under the short-visit limit) earns this share of a counted one. */
export const INEFFECTIVE_VISIT_WEIGHT = 0.25
/** The score takes the day's late first visit off by this factor (a late first visit, after the far window, costs 10%). */
export const LATE_FIRST_VISIT_SCORE_FACTOR = 0.9
/**
 * The distance rules, until the live settings load (app_settings, migration 0116). Each has its own switch.
 * - Travel: on a day travelling more than 25 km with a visit outside the home city (Phnom Penh), every full
 *   10 km takes 10 minutes off the paid hours the score is measured against.
 * - First visit: more than 10 km from the clock-in point gives 30 more minutes before it is late.
 * - Idle gap: travel over 10 km makes the limit 30 minutes plus 10 per full 10 km (never below the normal limit).
 */
export const DEFAULT_TRAVEL_DEDUCTION = { enabled: true, minKm: 25, stepKm: 10, minutes: 10, homeLat: 11.5564, homeLng: 104.9282, homeRadiusKm: 15 }
export const DEFAULT_FIRST_VISIT_FAR = { enabled: true, km: 10, extraMinutes: 30 }
export const DEFAULT_IDLE_FAR = { enabled: true, km: 10, stepKm: 10, minutesPerStep: 10, windowMinutes: 30 }
/**
 * What full marks looks like for each part of the effectiveness score: visits at
 * 100% of the day's target, active time at 50% of working hours, orders at 100%
 * of the person's daily order target (in USD). Each part is scored against its own goal; the score is their average.
 */
export const SCORE_GOAL_VISITS = 1
export const SCORE_GOAL_ACTIVE = 0.5

/** Unique customers expected on a full working day; a shorter day scales it (app_settings.daily_unique_customer_target). */
export const DEFAULT_DAILY_UNIQUE_CUSTOMER_TARGET = 5
/** A full working day, in hours, when the setting isn't available (app_settings.daily_working_hours). */
export const DEFAULT_FULL_DAY_HOURS = 8

/** Standardised flags used across attendance, visits, fleet, and reports. */
export const FLAGS = {
  UNASSIGNED_VISIT: 'UNASSIGNED_VISIT',
  LOW_LOCATION_ACCURACY: 'LOW_LOCATION_ACCURACY',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'AUTO_CHECKOUT_OUTSIDE_RADIUS',
  AUTO_CHECKOUT_CLOCK_OUT: 'AUTO_CHECKOUT_CLOCK_OUT',
  AUTO_CHECKOUT_WORKING_HOURS_END: 'AUTO_CHECKOUT_WORKING_HOURS_END',
  SHORT_VISIT: 'SHORT_VISIT',
  LATE_FIRST_VISIT: 'LATE_FIRST_VISIT',
  TRACKING_INTERRUPTED: 'TRACKING_INTERRUPTED',
  EARLY_CLOCK_OUT: 'EARLY_CLOCK_OUT',
} as const

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS]

/** Selfie capture constraints (client-side compression target). */
export const SELFIE_MAX_DIMENSION_PX = 720
export const SELFIE_JPEG_QUALITY = 0.7

/** Until the live setting loads: a clock-in more than this many minutes after the shift start counts as late (matches app_settings.late_grace_minutes' default). */
export const DEFAULT_LATE_GRACE_MINUTES = 5

/** A customer counts as due for a visit (Customers' "due" filter, the Team map's "overdue") once their last visit is this many days old. */
export const CUSTOMER_DUE_AFTER_DAYS = 14
