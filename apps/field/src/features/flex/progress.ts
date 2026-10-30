/**
 * Flexible days off by a minimum number of working days (0123): pure helpers
 * for the Working days page, its plan sheet, the settlement and the team list.
 * Dates are "YYYY-MM-DD" strings.
 */
import { enT, type Tr } from '@/features/customers/book'
import { days } from './flex'

/** worked: a clock-in · holiday / leave: credited · pend: leave waiting for approval · upcoming: still to come · missing: a past weekday with no clock-in · rest: a past weekend day with no clock-in (not required). */
export type ProgressKind = 'worked' | 'holiday' | 'leave' | 'pend' | 'upcoming' | 'missing' | 'rest'

export interface ProgressDay {
  day: string
  kind: ProgressKind
  credit: number
  /** 1 = Monday … 7 = Sunday. */
  weekday: number
  holidayName: string | null
}

/** One cycle for a person (flex_progress): live numbers, or the frozen settlement once settled. */
export interface FlexProgress {
  cycleStart: string
  cycleEnd: string
  closeDay: number
  isFlexible: boolean
  /** The minimum working days; null on a cycle settled by the old weekend-allowance rule. */
  minDays: number | null
  worked: number
  credited: number
  stillNeeded: number
  /** Days still to come where working is possible (weekends included). */
  available: number
  /** available - stillNeeded: days you can still skip. Negative = short. */
  spare: number
  closed: boolean
  settled: boolean
  settledAt: string | null
  /** Days that will count as absent (live: those that can no longer be worked). */
  shortDays: number
  aboveDays: number
  annualDays: number | null
  unpaidDays: number | null
  /** A cycle settled before the minimum rule (0123). */
  legacy: boolean
}

/** One person on flexible days off for managers / HR (flex_team_progress). */
export interface TeamProgressRow {
  userId: string
  name: string
  departmentName: string | null
  isFlexible: boolean
  nextFrom: string | null
  cycleStart: string
  cycleEnd: string
  minDays: number | null
  worked: number
  credited: number
  stillNeeded: number
  available: number
  spare: number
  settled: boolean
  shortDays: number
  annualDays: number | null
  unpaidDays: number | null
}

export type ProgressTone = 'ok' | 'warn' | 'danger' | 'muted'

/** Worked days plus leave and holidays: what counts toward the minimum. */
export const counted = (p: Pick<FlexProgress, 'worked' | 'credited'>) => p.worked + p.credited

/** The status chip: Met, On track, At risk (one spare day or none) or Short by N. */
export function progressStatus(p: Pick<FlexProgress, 'stillNeeded' | 'spare' | 'settled' | 'closed' | 'shortDays' | 'legacy'>, t: Tr = enT): { label: string; tone: ProgressTone } {
  if (p.legacy) return { label: t('workDays.stSettled'), tone: 'muted' }
  if (p.settled || p.closed) return p.shortDays > 0 ? { label: t('workDays.stShort', { n: days(p.shortDays) }), tone: 'danger' } : { label: t('workDays.stMet'), tone: 'ok' }
  if (p.stillNeeded <= 0) return { label: t('workDays.stMet'), tone: 'ok' }
  if (p.spare < 0) return { label: t('workDays.stShort', { n: days(-p.spare) }), tone: 'danger' }
  if (p.spare <= 1) return { label: t('workDays.stAtRisk'), tone: 'warn' }
  return { label: t('workDays.stOnTrack'), tone: 'ok' }
}

/** What taking `extra` more days off would do: spare days left, days short, and the leave they would come from (annual first, then unpaid). */
export function whatIf(p: Pick<FlexProgress, 'spare' | 'stillNeeded'>, extra: number, annualLeft: number): { spare: number; short: number; annual: number; unpaid: number; annualAfter: number } {
  const spare = p.stillNeeded <= 0 ? Infinity : p.spare - extra
  const short = spare === Infinity ? 0 : Math.max(0, -spare)
  const annual = Math.min(short, Math.max(0, annualLeft))
  return { spare: spare === Infinity ? p.spare : spare, short, annual, unpaid: short - annual, annualAfter: Math.max(0, annualLeft) - annual }
}

/** Calendar cell: the tag under the date. */
export function progressTag(d: ProgressDay, t: Tr = enT): string {
  switch (d.kind) {
    case 'worked':
      return '✓'
    case 'holiday':
      return t('workDays.tagHol')
    case 'leave':
      return t('workDays.tagLeave')
    case 'pend':
      return t('workDays.tagPlan')
    case 'missing':
      return t('workDays.tagOff')
    default:
      return ''
  }
}

/** A day's one-line label for lists and screen readers. */
export function progressLabel(d: ProgressDay, t: Tr = enT): string {
  switch (d.kind) {
    case 'worked':
      return t('workDays.lblWorked')
    case 'holiday':
      return d.holidayName ?? t('workDays.lblHoliday')
    case 'leave':
      return t('workDays.lblLeave')
    case 'pend':
      return t('workDays.lblPending')
    case 'missing':
      return t('workDays.lblMissing')
    case 'rest':
      return t('workDays.lblRest')
    default:
      return t('workDays.lblUpcoming')
  }
}

/** Monday-first cells for a cycle: nulls before the first day. */
export function progressCells(list: ProgressDay[]): (ProgressDay | null)[] {
  if (!list.length) return []
  return [...Array.from({ length: list[0].weekday - 1 }, () => null), ...list]
}

/** The days still open to work or take off (what the plan sheet lets you pick). */
export const pickableDays = (list: ProgressDay[]) => list.filter((d) => d.kind === 'upcoming' || d.kind === 'pend')

/** A team row's chip: starts / company schedule, else the same status as your own page. */
export function teamProgressStatus(r: TeamProgressRow, t: Tr = enT, shortDate: (s: string) => string = (s) => s): { label: string; tone: ProgressTone } {
  if (!r.isFlexible) return { label: r.nextFrom ? t('flex.stStarts', { date: shortDate(r.nextFrom) }) : t('flex.stCompany'), tone: 'muted' }
  return progressStatus({ stillNeeded: r.stillNeeded, spare: r.spare, settled: r.settled, closed: r.settled, shortDays: r.shortDays, legacy: r.settled && r.minDays == null }, t)
}
