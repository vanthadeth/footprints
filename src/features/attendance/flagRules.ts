import {
  APP_TIMEZONE,
  DEFAULT_DAILY_ORDER_TARGET_USD,
  DEFAULT_DAILY_UNIQUE_CUSTOMER_TARGET,
  DEFAULT_DAILY_VISIT_TARGET,
  DEFAULT_FIRST_VISIT_DEADLINE,
  DEFAULT_FORGOTTEN_VISIT_CAP_MINUTES,
  DEFAULT_FIRST_VISIT_FAR,
  DEFAULT_FULL_DAY_HOURS,
  DEFAULT_IDLE_FAR,
  DEFAULT_LATE_GRACE_MINUTES,
  DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES,
  DEFAULT_LUNCH_IDLE_THRESHOLD_MINUTES,
  DEFAULT_LUNCH_WINDOW_END,
  DEFAULT_LUNCH_WINDOW_START,
  DEFAULT_SHORT_VISIT_THRESHOLD_MINUTES,
  DEFAULT_TRAVEL_DEDUCTION,
  DEFAULT_VISIT_CREDIT_CAP_MINUTES,
} from '@/lib/config'
import { localDateKey } from '@/lib/dateRange'

/**
 * The flag rules, in one place. The manager alert (app.attendance_alerts via
 * app.idle_threshold_minutes), app.check_in and app._auto_close_session apply
 * the same rules on the server; every screen reads them from here. The
 * effectiveness numbers (what a visit is worth, the daily customer target) ride
 * along because every screen that needs the flag rules needs them too.
 */

/** How long a gap must be to be flagged idle, and the lunch window that makes it longer. Times are "HH:MM[:SS]" Asia/Phnom_Penh. */
export interface IdleFarRule {
  enabled: boolean
  km: number
  stepKm: number
  minPerStep: number
  windowMin: number
}

export interface IdleRule {
  idleMin: number
  lunchStart: string
  lunchEnd: string
  lunchMin: number
  /** A gap that travelled further than `farKm` uses `farWindowMin` + `farMinPerStep` per full `farStepKm` (never below idleMin). */
  far: IdleFarRule
}

/** The first-visit deadline moves out by `extraMin` when the first stop is further than `km` from the clock-in point. */
export interface FirstVisitFarRule {
  enabled: boolean
  km: number
  extraMin: number
}

/** On a day with travel over `minKm` and a visit outside the home city, every full `stepKm` takes `minutes` off paid time. */
export interface TravelRule {
  enabled: boolean
  minKm: number
  stepKm: number
  minutes: number
  homeLat: number
  homeLng: number
  homeRadiusKm: number
}

export interface FlagRules {
  idle: IdleRule
  /** A forgotten (auto-closed) visit counts at most this many minutes. */
  forgottenCapMin: number
  /** A first customer visit of the day after this time is flagged. */
  firstVisitDeadline: string
  firstVisitFar: FirstVisitFarRule
  travel: TravelRule
  /** Minutes after a person's start time before a clock-in counts as late (the score then counts their full working hours). */
  lateGraceMin: number
  /** A completed visit shorter than this counts nothing toward effectiveness. */
  shortVisitMin: number
  /** A visit counts toward effectiveness for at most this many minutes. */
  visitCreditCapMin: number
  /** Visits expected on a full day of `fullDayHours` (the effectiveness score), and unique customers. */
  visitTarget: number
  /** Orders expected on a full day in USD, for people without their own target. */
  orderTargetUsd: number
  uniqueTarget: number
  fullDayHours: number
}

export const DEFAULT_FLAG_RULES: FlagRules = {
  idle: {
    idleMin: DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES,
    lunchStart: DEFAULT_LUNCH_WINDOW_START,
    lunchEnd: DEFAULT_LUNCH_WINDOW_END,
    lunchMin: DEFAULT_LUNCH_IDLE_THRESHOLD_MINUTES,
    far: {
      enabled: DEFAULT_IDLE_FAR.enabled,
      km: DEFAULT_IDLE_FAR.km,
      stepKm: DEFAULT_IDLE_FAR.stepKm,
      minPerStep: DEFAULT_IDLE_FAR.minutesPerStep,
      windowMin: DEFAULT_IDLE_FAR.windowMinutes,
    },
  },
  forgottenCapMin: DEFAULT_FORGOTTEN_VISIT_CAP_MINUTES,
  firstVisitDeadline: DEFAULT_FIRST_VISIT_DEADLINE,
  firstVisitFar: { enabled: DEFAULT_FIRST_VISIT_FAR.enabled, km: DEFAULT_FIRST_VISIT_FAR.km, extraMin: DEFAULT_FIRST_VISIT_FAR.extraMinutes },
  travel: {
    enabled: DEFAULT_TRAVEL_DEDUCTION.enabled,
    minKm: DEFAULT_TRAVEL_DEDUCTION.minKm,
    stepKm: DEFAULT_TRAVEL_DEDUCTION.stepKm,
    minutes: DEFAULT_TRAVEL_DEDUCTION.minutes,
    homeLat: DEFAULT_TRAVEL_DEDUCTION.homeLat,
    homeLng: DEFAULT_TRAVEL_DEDUCTION.homeLng,
    homeRadiusKm: DEFAULT_TRAVEL_DEDUCTION.homeRadiusKm,
  },
  lateGraceMin: DEFAULT_LATE_GRACE_MINUTES,
  shortVisitMin: DEFAULT_SHORT_VISIT_THRESHOLD_MINUTES,
  visitCreditCapMin: DEFAULT_VISIT_CREDIT_CAP_MINUTES,
  visitTarget: DEFAULT_DAILY_VISIT_TARGET,
  orderTargetUsd: DEFAULT_DAILY_ORDER_TARGET_USD,
  uniqueTarget: DEFAULT_DAILY_UNIQUE_CUSTOMER_TARGET,
  fullDayHours: DEFAULT_FULL_DAY_HOURS,
}

const minutesOf = (hms: string) => {
  const [h, m] = hms.split(':').map(Number)
  return h * 60 + m
}

/** Minutes since local midnight of an instant. */
function localMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(ms))
  return (Number(parts.find((p) => p.type === 'hour')!.value) % 24) * 60 + Number(parts.find((p) => p.type === 'minute')!.value)
}

/**
 * Minutes a gap from `fromMs` to `toMs` must exceed to be flagged. `distanceM` is how far
 * the person travelled across the gap (previous check-out to the next check-in): past
 * the far distance the limit is the window plus minutes per full step, never below the
 * normal limit. The lunch limit applies on top when the gap overlaps the lunch window
 * on the same local day (possible lunch) and is longer. Mirrors app.idle_threshold_minutes.
 */
export function gapThresholdMin(fromMs: number, toMs: number, rule: IdleRule, distanceM = 0): number {
  const sameDay = localDateKey(new Date(fromMs).toISOString()) === localDateKey(new Date(toMs).toISOString())
  const overlapsLunch = sameDay && localMinutes(fromMs) < minutesOf(rule.lunchEnd) && localMinutes(toMs) > minutesOf(rule.lunchStart)
  const f = rule.far
  const travelMin = f?.enabled && distanceM > f.km * 1000 ? Math.max(rule.idleMin, f.windowMin + f.minPerStep * Math.floor(distanceM / 1000 / f.stepKm)) : rule.idleMin
  return overlapsLunch ? Math.max(travelMin, rule.lunchMin) : travelMin
}

/** Is this gap, between two visits or after the last check-out, long enough to be flagged? */
export function isFlaggedGap(fromMs: number, toMs: number, rule: IdleRule, distanceM = 0): boolean {
  return toMs > fromMs && (toMs - fromMs) / 60_000 > gapThresholdMin(fromMs, toMs, rule, distanceM)
}

/** Visits closed because nobody checked out (at clock-out or the end of the day). */
export const FORGOTTEN_VISIT_FLAGS = ['AUTO_CHECKOUT_CLOCK_OUT', 'AUTO_CHECKOUT_WORKING_HOURS_END']

interface VisitLike {
  checked_in_at: string
  checked_out_at: string | null
  flags?: string[] | null
}

/**
 * A visit's [start, end] in epoch ms, an open one running to `now`. A visit
 * closed because nobody checked out counts at most the cap -- the rest is a
 * gap. (New ones are already stored that way; this also covers older ones.)
 */
export function visitSpan(v: VisitLike, now: number, capMin: number = DEFAULT_FORGOTTEN_VISIT_CAP_MINUTES): [number, number] {
  const start = new Date(v.checked_in_at).getTime()
  let end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : now
  if (v.checked_out_at && v.flags?.some((f) => FORGOTTEN_VISIT_FLAGS.includes(f))) end = Math.min(end, start + capMin * 60_000)
  return [start, Math.max(start, end)]
}

export type FirstVisit =
  | { kind: 'ok' }
  | { kind: 'late'; at: number }
  /** Clocked in, past the deadline, and still no customer visit. */
  | { kind: 'none' }
  /** Nothing to judge yet (not clocked in, or the deadline hasn't passed). */
  | { kind: 'pending' }

/** The first-visit deadline in ms for a day, moved out when the first stop was far from the clock-in point. */
export function firstVisitDeadlineMs(date: string, deadline: string, far: FirstVisitFarRule | undefined, fromClockInM: number | null): number {
  const base = new Date(`${date}T${deadline.slice(0, 5)}:00+07:00`).getTime()
  return far?.enabled && fromClockInM != null && fromClockInM > far.km * 1000 ? base + far.extraMin * 60_000 : base
}

/**
 * The day's first-visit rule: the first customer check-in after the deadline is
 * flagged; so is being clocked in past the deadline with no visit yet. `fromClockInM`
 * is the distance from where the person clocked in to that first visit: past the far
 * distance the deadline moves out. `date` is the local day ("YYYY-MM-DD") being
 * judged; `now` decides whether its deadline has passed.
 */
export function firstVisitStatus(
  visits: { checked_in_at: string; cancelled_at?: string | null }[],
  clockedIn: boolean,
  date: string,
  deadline: string,
  now: number,
  far?: FirstVisitFarRule,
  fromClockInM: number | null = null
): FirstVisit {
  const first = visits.filter((v) => !v.cancelled_at).map((v) => new Date(v.checked_in_at).getTime()).sort((a, b) => a - b)[0]
  if (first !== undefined) return first > firstVisitDeadlineMs(date, deadline, far, fromClockInM) ? { kind: 'late', at: first } : { kind: 'ok' }
  const deadlineMs = firstVisitDeadlineMs(date, deadline, far, null)
  return clockedIn && now > deadlineMs ? { kind: 'none' } : { kind: 'pending' }
}

export interface FlagRuleSettings {
  idleAlertThresholdMinutes: number
  lunchWindowStart: string
  lunchWindowEnd: string
  lunchIdleThresholdMinutes: number
  forgottenVisitCapMinutes: number
  firstVisitDeadline: string
  firstVisitFar: FirstVisitFarRule
  travel: TravelRule
  idleFar: IdleFarRule
  shortVisitThresholdMinutes: number
  /** Optional so older callers keep the default. */
  lateGraceMinutes?: number
  visitCreditCapMinutes: number
  dailyVisitTarget: number
  /** Optional so older callers keep the default. */
  dailyOrderTargetUsd?: number
  dailyUniqueCustomerTarget: number
  dailyWorkingHours: number
}

/** The rules from the live settings (useAppSettings). */
export function flagRulesOf(s: FlagRuleSettings): FlagRules {
  return {
    idle: { idleMin: s.idleAlertThresholdMinutes, lunchStart: s.lunchWindowStart, lunchEnd: s.lunchWindowEnd, lunchMin: s.lunchIdleThresholdMinutes, far: s.idleFar },
    forgottenCapMin: s.forgottenVisitCapMinutes,
    firstVisitDeadline: s.firstVisitDeadline,
    firstVisitFar: s.firstVisitFar,
    travel: s.travel,
    lateGraceMin: s.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES,
    shortVisitMin: s.shortVisitThresholdMinutes,
    visitCreditCapMin: s.visitCreditCapMinutes,
    visitTarget: s.dailyVisitTarget,
    orderTargetUsd: s.dailyOrderTargetUsd ?? DEFAULT_DAILY_ORDER_TARGET_USD,
    uniqueTarget: s.dailyUniqueCustomerTarget,
    fullDayHours: s.dailyWorkingHours,
  }
}
