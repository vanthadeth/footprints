import { APP_TIMEZONE } from './config'

/**
 * All "today"/"this week"/business-day boundaries use APP_TIMEZONE
 * (Asia/Phnom_Penh), never the browser's local timezone and never UTC --
 * a salesperson's midnight in Phnom Penh is what defines their working day.
 */

/** ISO string for the start (00:00:00) of "today" in APP_TIMEZONE. */
export function startOfTodayIso(timezone: string = APP_TIMEZONE): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  // Interpret that calendar date as midnight in `timezone` by asking what
  // UTC offset is in effect there right now (good enough: DST-free zone).
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, now)
  const utcMidnight = Date.parse(`${y}-${m}-${d}T00:00:00Z`)
  return new Date(utcMidnight - offsetMinutes * 60_000).toISOString()
}

function getTimezoneOffsetMinutes(timezone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return (asUtc - at.getTime()) / 60_000
}

export function formatTime(iso: string | null, timezone: string = APP_TIMEZONE): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso)
  )
}

export function greeting(timezone: string = APP_TIMEZONE): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date())
  )
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** "1 min ago" / "18 min ago" style relative time for freshness indicators (spec §36). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime()
  if (diffMs < 0) return 'just now'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Always "dd/mm/yyyy", regardless of the viewer's browser locale. */
export function formatDate(iso: string | null, timezone: string = APP_TIMEZONE): string {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(iso)
  )
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${d}/${m}/${y}`
}

/** "Monday, 14 September" -- Home's greeting header. Always this shape, regardless of browser locale (same reasoning as formatDate). */
export function formatLongDate(iso: string = new Date().toISOString(), timezone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(new Date(iso))
  const weekday = parts.find((p) => p.type === 'weekday')!.value
  const day = parts.find((p) => p.type === 'day')!.value
  const month = parts.find((p) => p.type === 'month')!.value
  return `${weekday}, ${day} ${month}`
}

/**
 * Is "now" at or past `timeOfDay` (a "HH:MM" or "HH:MM:SS" string, as
 * app_settings.work_end_time comes back from Postgres) plus a grace period?
 * This is only ever used client-side to decide WHETHER to bother asking for
 * a location fix and calling enforce_working_hours -- the server re-checks
 * against its own clock before actually auto-clocking anyone out, so a
 * wrong device clock here costs at most one wasted or delayed check, never
 * an incorrect write (rule #65: never trust the client clock for the
 * decision itself).
 */
export function isPastTimeOfDay(
  timeOfDay: string,
  graceMinutes: number = 0,
  timezone: string = APP_TIMEZONE,
  now: Date = new Date()
): boolean {
  const [h, m] = timeOfDay.split(':').map(Number)
  const thresholdMinutes = h * 60 + m + graceMinutes

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')!.value) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')!.value)

  return hour * 60 + minute >= thresholdMinutes
}

/**
 * Is "now" within the clock-in window -- [work_start_time minus the
 * admin's early-clock-in allowance, work_end_time) -- mirroring
 * app.within_clock_in_window() server-side. Only used to disable the
 * Clock In button and explain why; the RPC is still the one true gate
 * (never trust the client clock for the actual write), so a wrong device
 * clock here means at worst a button that's briefly mis-enabled/disabled,
 * never a clock-in that shouldn't have gone through.
 */
export function isWithinClockInWindow(
  workStartTime: string,
  workEndTime: string,
  allowEarlyClockinMinutes: number,
  timezone: string = APP_TIMEZONE,
  now: Date = new Date()
): boolean {
  return (
    isPastTimeOfDay(workStartTime, -allowEarlyClockinMinutes, timezone, now) && !isPastTimeOfDay(workEndTime, 0, timezone, now)
  )
}

/**
 * Shifts a "HH:MM" or "HH:MM:SS" time-of-day by `offsetMinutes` (may be
 * negative), wrapping within a single day. Used to show e.g. "Clock-in
 * opens at 07:45" from work_start_time and the early-allowance minutes.
 */
export function shiftTimeOfDay(timeOfDay: string, offsetMinutes: number): string {
  const [h, m] = timeOfDay.split(':').map(Number)
  const total = (((h * 60 + m + offsetMinutes) % 1440) + 1440) % 1440
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min`
  return `${hours}h ${minutes}m`
}
