import { fromKey, type DateKey } from './calendar'

/** AL annual, UL unpaid, SL sick, FD flexible day off taken as leave. */
export type LeaveCode = 'AL' | 'UL' | 'SL' | 'FD'

/**
 * One day's attendance result for one person. The first four are what a
 * working day can end as; the last three describe a day that is not a
 * normal working day for that person (a flexible day off, a public
 * holiday, or simply not scheduled, e.g. a Sunday).
 */
export type AttendanceRecord =
  /** `halfLeave`: also on approved half-day leave of that kind. */
  | { result: 'present'; halfLeave?: LeaveCode }
  /** `minutes`: minutes late in plus minutes early out, added together. */
  | { result: 'late'; minutes: number; halfLeave?: LeaveCode }
  /** `half`: a half-day of leave, with no clock-in. */
  | { result: 'leave'; code: LeaveCode; half?: boolean }
  | { result: 'absent' }
  /** A person on flexible days off who did not clock in: not an absence and not counted. */
  | { result: 'dayoff' }
  | { result: 'holiday' }
  | { result: 'off' }

export type MarkKind = 'present' | 'late' | 'leave' | 'absent' | 'dayoff' | 'holiday' | 'weekend' | 'future' | 'none'

/** What a day shows: a green check for present, otherwise `text` (18m, AL, A); `half` adds a ½. */
export interface DayMark {
  kind: MarkKind
  text: string
  /** Half a day of leave, alone or next to a clock-in. */
  half: boolean
  /** The result in words, for the cell's accessible name; empty for plain days. */
  label: string
}

export const LEAVE_NAMES: Record<LeaveCode, string> = { AL: 'Annual leave', UL: 'Unpaid leave', SL: 'Sick leave', FD: 'Flexible day off' }

export interface MarkContext {
  today: DateKey
  holidays?: DateKey[]
}

export const minutesText = (m: number) => `${m}m`

const plain = (kind: MarkKind, label = ''): DayMark => ({ kind, text: '', half: false, label })

const halfLabel = (code?: LeaveCode) => (code ? `, half-day ${LEAVE_NAMES[code].toLowerCase()}` : '')

/**
 * The mark for one date. A record decides it when there is one (so a
 * working Saturday, or a holiday for one department, shows what happened);
 * without a record the date falls back to the calendar: weekend, the
 * holiday list, future (nothing under it), or nothing for a past day.
 */
export function dayMark(key: DateKey, ctx: MarkContext, record?: AttendanceRecord): DayMark {
  if (record) {
    switch (record.result) {
      case 'present':
        return { kind: 'present', text: '', half: !!record.halfLeave, label: `present${halfLabel(record.halfLeave)}` }
      case 'late':
        return { kind: 'late', text: minutesText(record.minutes), half: !!record.halfLeave, label: `late or early, ${record.minutes} minutes in total${halfLabel(record.halfLeave)}` }
      case 'leave':
        return { kind: 'leave', text: record.code, half: !!record.half, label: `${record.half ? 'half-day ' : ''}${LEAVE_NAMES[record.code].toLowerCase()}` }
      case 'absent':
        return { kind: 'absent', text: 'A', half: false, label: 'absent' }
      case 'dayoff':
        return { kind: 'dayoff', text: '–', half: false, label: 'day off' }
      case 'holiday':
        return plain('holiday', 'public holiday')
      case 'off':
        return plain('weekend')
    }
  }
  const dow = fromKey(key).getDay()
  if (dow === 0 || dow === 6) return plain('weekend')
  if (ctx.holidays?.includes(key)) return plain('holiday', 'public holiday')
  if (key > ctx.today) return plain('future')
  return plain('none')
}

export interface AttendanceSummary {
  present: number
  late: number
  lateMinutes: number
  leave: number
  absent: number
  /** Days with a result: present + late + leave + absent. */
  workingDays: number
  /** Share of working days attended (present or late), 0-100; 0 when there are none. */
  rate: number
}

export function emptySummary(): AttendanceSummary {
  return { present: 0, late: 0, lateMinutes: 0, leave: 0, absent: 0, workingDays: 0, rate: 0 }
}

/** Adds one day's mark to a summary in place (record is only needed for late minutes). Day off, holiday, weekend, future and unrecorded days are not counted. */
export function addToSummary(s: AttendanceSummary, mark: DayMark, record?: AttendanceRecord): void {
  if (mark.kind === 'present') s.present++
  else if (mark.kind === 'late') {
    s.late++
    if (record?.result === 'late') s.lateMinutes += record.minutes
  } else if (mark.kind === 'leave') s.leave++
  else if (mark.kind === 'absent') s.absent++
  else return
  s.workingDays++
  s.rate = Math.round(((s.present + s.late) / s.workingDays) * 100)
}

/** Counts over a list of dates for one person. */
export function summarize(keys: DateKey[], records: Record<DateKey, AttendanceRecord>, ctx: MarkContext): AttendanceSummary {
  const s = emptySummary()
  for (const k of keys) addToSummary(s, dayMark(k, ctx, records[k]), records[k])
  return s
}
