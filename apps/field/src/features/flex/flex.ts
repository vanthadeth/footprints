/**
 * Flexible days off (0100): pure helpers for the Days off page, the
 * settlement and the request sheet. Dates are "YYYY-MM-DD" strings.
 */
import { enT, type Tr } from '@/features/customers/book'

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
export function shortDate(s: string, language: 'en' | 'km' = 'en'): string {
  const d = utc(s)
  if (language === 'km') return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "Tue 20 Oct". */
const KM_WEEKDAYS_SHORT = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍']
export function dayDate(s: string, language: 'en' | 'km' = 'en'): string {
  return `${language === 'km' ? KM_WEEKDAYS_SHORT[utc(s).getUTCDay()] : WEEKDAYS[utc(s).getUTCDay()]} ${shortDate(s, language)}`
}

export function addDays(s: string, n: number): string {
  return new Date(utc(s).getTime() + n * 86_400_000).toISOString().slice(0, 10)
}

export function cycleLabel(c: Pick<FlexCycle, 'cycleStart' | 'cycleEnd'>, language: 'en' | 'km' = 'en'): string {
  return `${shortDate(c.cycleStart, language)} – ${shortDate(c.cycleEnd, language)}`
}

/** Days taken plus planned beyond the allowance (0 when within it). */
export function over(c: Pick<FlexCycle, 'left'>): number {
  return Math.max(0, -c.left)
}

export type CycleStatus = { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }

export function cycleStatus(c: FlexCycle, t: Tr = enT): CycleStatus {
  if (c.settled || c.closed) return { label: t('flex.stSettled'), tone: 'muted' }
  if (c.left < 0) return { label: t('flex.stOver', { n: days(-c.left) }), tone: 'danger' }
  if (c.left <= 1) return { label: t('flex.stAlmost'), tone: 'warn' }
  return { label: t('flex.stOnTrack'), tone: 'ok' }
}

/** What a day's cell shows: a short tag and the style it uses. */
export function cellTag(d: FlexDay, t: Tr = enT): string {
  switch (d.kind) {
    case 'worked':
      return '✓'
    case 'flex':
      return d.cost < 1 ? t('flex.tagHalfOff') : t('flex.tagOff')
    case 'auto':
      return t('flex.tagAuto')
    case 'pend':
      return t('flex.tagPlan')
    case 'holiday':
      return t('flex.tagHol')
    case 'leave':
      return t('flex.tagLeave')
    default:
      return ''
  }
}

export function cellLabel(d: FlexDay, t: Tr = enT): string {
  switch (d.kind) {
    case 'worked':
      return d.weekday >= 6 ? t('flex.lblWeekendWorked') : t('flex.lblWorked')
    case 'flex':
      return d.cost < 1 ? t('flex.lblHalfOff') : t('flex.lblDayOff')
    case 'auto':
      return t('flex.lblNoClockIn')
    case 'pend':
      return t('flex.lblPlanned')
    case 'holiday':
      return d.holidayName ?? t('flex.lblHoliday')
    case 'leave':
      return t('flex.lblOnLeave')
    default:
      return t('flex.lblUpcoming')
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
export function usedRows(list: FlexDay[], t: Tr = enT, language: 'en' | 'km' = 'en'): UsedRow[] {
  return list
    .filter((d) => d.cost > 0)
    .map((d) => ({
      day: dayDate(d.day, language),
      note: d.kind === 'auto' ? t('flex.noteNoClockIn') : d.kind === 'pend' ? t('flex.notePending') : d.cost < 1 ? t('flex.noteHalf') : t('flex.noteRequested'),
      amount: `−${days(d.cost)}`,
      pending: d.kind === 'pend',
    }))
}

/** For the request sheet: what's left after a request of `n` days (negative = over). */
export function leftAfter(c: Pick<FlexCycle, 'allowance' | 'taken' | 'planned'>, n: number): number {
  return c.allowance - c.taken - c.planned - n
}

/** A team row's status pill (Flexible days off, for managers/HR). */
export function teamStatus(r: { isFlexible: boolean; nextFrom: string | null; settled: boolean; left: number }, t: Tr = enT, language: 'en' | 'km' = 'en'): CycleStatus {
  if (!r.isFlexible) return { label: r.nextFrom ? t('flex.stStarts', { date: shortDate(r.nextFrom, language) }) : t('flex.stCompany'), tone: 'muted' }
  if (r.left < 0) return { label: t('flex.stOver', { n: days(-r.left) }), tone: 'danger' }
  if (r.settled) return { label: t('flex.stSettled'), tone: 'muted' }
  if (r.left <= 1) return { label: t('flex.stAlmost'), tone: 'warn' }
  return { label: t('flex.stOnTrack'), tone: 'ok' }
}
