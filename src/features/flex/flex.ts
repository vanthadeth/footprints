/**
 * Flexible days off (0100): pure helpers for the Days off page, the
 * settlement and the request sheet. Dates are "YYYY-MM-DD" strings.
 */

export type FlexKind = 'holiday' | 'worked' | 'flex' | 'pend' | 'leave' | 'upcoming' | 'auto'

/** One day of a cycle for someone on flexible days off (flex_days). weekday: 1 = Monday … 7 = Sunday. */
export interface FlexDay {
  day: string
  kind: FlexKind
  cost: number
  weekday: number
  requestId: string | null
  holidayName: string | null
}

/** A cycle's numbers (flex_cycle): live, or frozen once settled. */
export interface FlexCycle {
  cycleStart: string
  cycleEnd: string
  closeDay: number
  isFlexible: boolean
  saturdays: number
  sundays: number
  satRate: number
  sunRate: number
  allowance: number
  requested: number
  autoDays: number
  taken: number
  planned: number
  left: number
  closed: boolean
  settled: boolean
  settledAt: string | null
  unusedDays: number
  overDays: number
  annualDays: number | null
  unpaidDays: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const utc = (s: string) => new Date(s + 'T00:00:00Z')

/** 6 → "6", 2.5 → "2.5". */
export function days(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** "½" and "1" read better than 0.5 for a rate. */
export function rate(n: number): string {
  return n === 0.5 ? '½' : days(n)
}

/** "21 Sep". */
export function shortDate(s: string): string {
  const d = utc(s)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "Tue 20 Oct". */
export function dayDate(s: string): string {
  return `${WEEKDAYS[utc(s).getUTCDay()]} ${shortDate(s)}`
}

export function addDays(s: string, n: number): string {
  return new Date(utc(s).getTime() + n * 86_400_000).toISOString().slice(0, 10)
}

export function cycleLabel(c: Pick<FlexCycle, 'cycleStart' | 'cycleEnd'>): string {
  return `${shortDate(c.cycleStart)} – ${shortDate(c.cycleEnd)}`
}

/** Days taken plus planned beyond the allowance (0 when within it). */
export function over(c: Pick<FlexCycle, 'left'>): number {
  return Math.max(0, -c.left)
}

export type CycleStatus = { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }

export function cycleStatus(c: FlexCycle): CycleStatus {
  if (c.settled || c.closed) return { label: 'Settled', tone: 'muted' }
  if (c.left < 0) return { label: `Over by ${days(-c.left)}`, tone: 'danger' }
  if (c.left <= 1) return { label: 'Almost used', tone: 'warn' }
  return { label: 'On track', tone: 'ok' }
}

/** What a day's cell shows: a short tag and the style it uses. */
export function cellTag(d: FlexDay): string {
  switch (d.kind) {
    case 'worked':
      return '✓'
    case 'flex':
      return d.cost < 1 ? '½ Off' : 'Off'
    case 'auto':
      return 'Auto'
    case 'pend':
      return 'Plan'
    case 'holiday':
      return 'Hol'
    case 'leave':
      return 'Leave'
    default:
      return ''
  }
}

export function cellLabel(d: FlexDay): string {
  switch (d.kind) {
    case 'worked':
      return d.weekday >= 6 ? 'Weekend worked' : 'Worked'
    case 'flex':
      return d.cost < 1 ? 'Half day off' : 'Day off'
    case 'auto':
      return 'No clock-in'
    case 'pend':
      return 'Planned'
    case 'holiday':
      return d.holidayName ?? 'Holiday'
    case 'leave':
      return 'On leave'
    default:
      return 'Upcoming'
  }
}

/** Monday-first cells for a cycle: nulls before the first day. */
export function cycleCells(list: FlexDay[]): (FlexDay | null)[] {
  if (!list.length) return []
  const lead = list[0].weekday - 1
  return [...Array.from({ length: lead }, () => null), ...list]
}

export interface UsedRow {
  day: string
  note: string
  amount: string
  pending: boolean
}

/** The days that use the allowance, with why. */
export function usedRows(list: FlexDay[]): UsedRow[] {
  return list
    .filter((d) => d.cost > 0)
    .map((d) => ({
      day: dayDate(d.day),
      note: d.kind === 'auto' ? 'No clock-in' : d.kind === 'pend' ? 'Planned · waiting for approval' : d.cost < 1 ? 'Half day' : 'Requested · approved',
      amount: `−${days(d.cost)}`,
      pending: d.kind === 'pend',
    }))
}

/** For the request sheet: what's left after a request of `n` days (negative = over). */
export function leftAfter(c: Pick<FlexCycle, 'allowance' | 'taken' | 'planned'>, n: number): number {
  return c.allowance - c.taken - c.planned - n
}
