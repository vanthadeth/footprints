import { fromKey, type DateKey } from './calendar'

export type LeaveCode = 'AL' | 'UL' | 'SL'

/** One working day's attendance result. */
export type AttendanceRecord =
  | { result: 'present' }
  /** `minutes`: minutes late in plus minutes early out, added together. */
  | { result: 'late'; minutes: number }
  | { result: 'leave'; code: LeaveCode }
  | { result: 'absent' }

export type MarkKind = 'present' | 'late' | 'leave' | 'absent' | 'holiday' | 'weekend' | 'future' | 'none'

/** What a day shows: a green check for present, otherwise `text` (18m, AL, A). */
export interface DayMark {
  kind: MarkKind
  text: string
  /** The result in words, for the cell's accessible name; empty for plain days. */
  label: string
}

export const LEAVE_NAMES: Record<LeaveCode, string> = { AL: 'Annual leave', UL: 'Unpaid leave', SL: 'Sick leave' }

export interface MarkContext {
  today: DateKey
  holidays?: DateKey[]
}

export const minutesText = (m: number) => `${m}m`

/**
 * The mark for one date. Weekends and holidays come first, then future
 * days (nothing under them), then the day's record; a past working day
 * with no record shows nothing.
 */
export function dayMark(key: DateKey, ctx: MarkContext, record?: AttendanceRecord): DayMark {
  const dow = fromKey(key).getDay()
  if (dow === 0 || dow === 6) return { kind: 'weekend', text: '', label: '' }
  if (ctx.holidays?.includes(key)) return { kind: 'holiday', text: '', label: 'public holiday' }
  if (key > ctx.today) return { kind: 'future', text: '', label: '' }
  if (!record) return { kind: 'none', text: '', label: '' }
  switch (record.result) {
    case 'present':
      return { kind: 'present', text: '', label: 'present' }
    case 'late':
      return { kind: 'late', text: minutesText(record.minutes), label: `late or early, ${record.minutes} minutes in total` }
    case 'leave':
      return { kind: 'leave', text: record.code, label: LEAVE_NAMES[record.code].toLowerCase() }
    case 'absent':
      return { kind: 'absent', text: 'A', label: 'absent' }
  }
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

/** Adds one day's mark to a summary in place (record is only needed for late minutes). */
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
