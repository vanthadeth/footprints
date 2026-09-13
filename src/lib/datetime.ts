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

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min`
  return `${hours}h ${minutes}m`
}
