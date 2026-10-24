/** Minutes after midnight. */
export type Minute = number

export type StripKind = 'short' | 'good' | 'long' | 'travel' | 'idle' | 'missed'

/** What happened at a visit, shown as an icon under the strip. */
export type StripIcon = 'ordered' | 'confirmed' | 'collection' | 'appointment'

export interface StripVisit {
  start: Minute
  end: Minute
  /** Adds a red top border to the visit. */
  flagged?: boolean
  /** Icons for this visit, left to right. */
  icons?: StripIcon[]
}

export interface StripDay {
  /** Working hours. */
  shiftStart: Minute
  shiftEnd: Minute
  /** Clock-in and clock-out. */
  clockIn: Minute
  clockOut: Minute
  /** Visits in time order. */
  visits: StripVisit[]
}

export interface StripSegment {
  kind: StripKind
  flagged: boolean
  start: Minute
  end: Minute
  /** Percent of the axis, 0-100. */
  left: number
  width: number
}

/** A visit under this many minutes is "short"; over LONG_VISIT_MIN is "long". */
export const SHORT_VISIT_MIN = 5
export const LONG_VISIT_MIN = 45
/** A gap longer than this is idle rather than travel. */
export const IDLE_GAP_MIN = 30

export function visitKind(minutes: number): 'short' | 'good' | 'long' {
  return minutes < SHORT_VISIT_MIN ? 'short' : minutes > LONG_VISIT_MIN ? 'long' : 'good'
}

export function gapKind(minutes: number): 'travel' | 'idle' {
  return minutes > IDLE_GAP_MIN ? 'idle' : 'travel'
}

/** "08:30" -> 510. */
export function hm(text: string): Minute {
  const [h, m] = text.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * The strip's segments, in order: not-clocked-in before the clock-in, the
 * visits with travel or idle gaps between them, then the tail to clock-out
 * and not-clocked-in up to the end of the shift. The axis runs from
 * `axisStart` to `axisEnd`; anything outside it is clipped.
 */
export function buildStrip(day: StripDay, axisStart: Minute, axisEnd: Minute): StripSegment[] {
  const span = axisEnd - axisStart
  if (span <= 0) return []
  const out: StripSegment[] = []
  const add = (kind: StripKind, start: Minute, end: Minute, flagged = false) => {
    const a = Math.max(start, axisStart)
    const b = Math.min(end, axisEnd)
    if (b <= a) return
    out.push({ kind, flagged, start, end, left: ((a - axisStart) / span) * 100, width: ((b - a) / span) * 100 })
  }
  if (day.clockIn > day.shiftStart) add('missed', day.shiftStart, day.clockIn)
  let cursor = day.clockIn
  for (const v of day.visits) {
    if (v.start > cursor) add(gapKind(v.start - cursor), cursor, v.start)
    add(visitKind(v.end - v.start), v.start, v.end, !!v.flagged)
    cursor = Math.max(cursor, v.end)
  }
  if (day.clockOut > cursor) add(gapKind(day.clockOut - cursor), cursor, day.clockOut)
  if (day.clockOut < day.shiftEnd) add('missed', day.clockOut, day.shiftEnd)
  return out
}

/** Position of a minute on the axis as a percent, clamped to 0-100. */
export function axisPercent(minute: Minute, axisStart: Minute, axisEnd: Minute): number {
  return Math.min(100, Math.max(0, ((minute - axisStart) / (axisEnd - axisStart)) * 100))
}

const KIND_LABEL: Record<StripKind, string> = {
  short: 'Short visit',
  good: 'Good visit',
  long: 'Long visit',
  travel: 'Travel',
  idle: 'Idling',
  missed: 'Not clocked in',
}

export function segmentTitle(s: StripSegment): string {
  const min = s.end - s.start
  const d = min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`
  return `${KIND_LABEL[s.kind]} · ${d}${s.flagged ? ' · flagged' : ''}`
}

/** 465 -> "07:45". */
export function clockText(minute: Minute): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export interface StripMark {
  kind: 'in' | 'out' | 'flag'
  /** Percent of the axis, 0-100. */
  left: number
  /** "In 07:45", "Out 17:40", "Far away". */
  label: string
}

/** Marks above the strip: clock-in, clock-out and one per flagged visit (at the visit's middle). */
export function buildMarks(day: StripDay, axisStart: Minute, axisEnd: Minute): StripMark[] {
  const at = (m: Minute) => axisPercent(m, axisStart, axisEnd)
  const marks: StripMark[] = [
    { kind: 'in', left: at(day.clockIn), label: `In ${clockText(day.clockIn)}` },
    { kind: 'out', left: at(day.clockOut), label: `Out ${clockText(day.clockOut)}` },
  ]
  for (const v of day.visits) if (v.flagged) marks.push({ kind: 'flag', left: at((v.start + v.end) / 2), label: 'Far away' })
  return marks
}

export interface StripPin {
  left: number
  icons: StripIcon[]
}

/** Icon pins under the strip: one per visit that has icons, at the visit's middle. */
export function buildPins(day: StripDay, axisStart: Minute, axisEnd: Minute): StripPin[] {
  return day.visits
    .filter((v) => v.icons && v.icons.length > 0)
    .map((v) => ({ left: axisPercent((v.start + v.end) / 2, axisStart, axisEnd), icons: v.icons! }))
}
