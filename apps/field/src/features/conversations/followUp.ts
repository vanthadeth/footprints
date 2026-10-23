import { APP_TIMEZONE } from '@/lib/config'

/**
 * Follow-up presets for a logged call: Tomorrow, In 3 days, or a picked
 * date, at one of a few set times. Dates are calendar days in
 * APP_TIMEZONE (Asia/Phnom_Penh, UTC+7 all year, no DST).
 */

export type FollowPreset = 'tomorrow' | 'in3' | 'pick'

export const FOLLOW_PRESETS: { key: FollowPreset; label: string; days: number | null }[] = [
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: 'in3', label: 'In 3 days', days: 3 },
  { key: 'pick', label: 'Pick a date', days: null },
]

export const FOLLOW_TIMES = ['09:00', '14:00', '16:00'] as const

const PHNOM_PENH_OFFSET = '+07:00'

/** Today's calendar date (YYYY-MM-DD) in APP_TIMEZONE. */
export function todayYmd(now: Date = new Date(), timezone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** The date a preset resolves to; `picked` is used for "Pick a date" (defaults to a week out). */
export function presetDate(preset: FollowPreset, now: Date = new Date(), picked?: string | null): string {
  const today = todayYmd(now)
  if (preset === 'tomorrow') return addDaysYmd(today, 1)
  if (preset === 'in3') return addDaysYmd(today, 3)
  return picked || addDaysYmd(today, 7)
}

/** "Thu 1 Oct" for a YYYY-MM-DD date. */
export function formatFollowDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d)
  const rest = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
  return `${weekday} ${rest}`
}

/** A date + HH:MM in Phnom Penh, as an ISO timestamp for follow_up_at. */
export function followUpIso(ymd: string, time: string): string {
  return new Date(`${ymd}T${time}:00${PHNOM_PENH_OFFSET}`).toISOString()
}

/** "Thu 1 Oct, 09:00" for a stored follow_up_at. */
export function formatFollowUpAt(iso: string, timezone: string = APP_TIMEZONE): string {
  const ymd = todayYmd(new Date(iso), timezone)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  return `${formatFollowDate(ymd)}, ${time}`
}

/** True when a follow-up falls on or before today in APP_TIMEZONE. */
export function isFollowUpDue(iso: string, now: Date = new Date()): boolean {
  return todayYmd(new Date(iso)) <= todayYmd(now)
}
