/** "YYYY-MM-DD" in local time. */
export type DateKey = string

export type WeekStart = 'mon' | 'sun'
export type CalendarView = 'month' | 'week' | 'agenda'

/** What a date carries: attendance as the cell background, a holiday as stripes, dots under the number. */
export interface DayMarks {
  attendance?: 'late' | 'leave' | 'absent'
  holiday?: boolean
  appointment?: boolean
  visit?: boolean
}

export interface DisabledRange {
  from: DateKey
  to: DateKey
}

export interface DayCell {
  key: DateKey
  day: number
  /** "MON".."SUN". */
  weekday: string
  inMonth: boolean
  weekend: boolean
  disabled: boolean
  today: boolean
  /** Selected wins over today. */
  selected: boolean
  /** Cell background: a holiday beats absent, absent beats on leave, on leave beats late. */
  background: 'holiday' | 'absent' | 'leave' | 'late' | null
  dots: ('appointment' | 'visit')[]
}

export interface DayOptions {
  today: DateKey
  selected?: DateKey
  disabled?: DisabledRange[]
  marks?: Record<DateKey, DayMarks>
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromKey(key)
  return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

/** First day of the month `delta` months from the month of `key`. */
export function addMonths(key: DateKey, delta: number): DateKey {
  const d = fromKey(key)
  return toKey(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

/** Monday=0 .. Sunday=6. */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** Weekday names in column order for the chosen week start. */
export function weekdayNames(weekStart: WeekStart): string[] {
  return weekStart === 'mon' ? WEEKDAYS : [WEEKDAYS[6], ...WEEKDAYS.slice(0, 6)]
}

/** Days since the start of the week the date falls in, 0-6. */
function offsetInWeek(d: Date, weekStart: WeekStart): number {
  return weekStart === 'mon' ? mondayIndex(d) : d.getDay()
}

/** The first day of the week that contains `key`. */
export function startOfWeek(key: DateKey, weekStart: WeekStart): DateKey {
  return addDays(key, -offsetInWeek(fromKey(key), weekStart))
}

function cellFor(key: DateKey, monthKey: DateKey | null, o: DayOptions): DayCell {
  const d = fromKey(key)
  const marks = o.marks?.[key]
  const isDisabled = !!o.disabled?.some((r) => key >= r.from && key <= r.to)
  const background = marks?.holiday ? 'holiday' : marks?.attendance === 'absent' ? 'absent' : marks?.attendance === 'leave' ? 'leave' : marks?.attendance === 'late' ? 'late' : null
  const dots: DayCell['dots'] = []
  if (marks?.appointment) dots.push('appointment')
  if (marks?.visit) dots.push('visit')
  return {
    key,
    day: d.getDate(),
    weekday: WEEKDAYS[mondayIndex(d)],
    inMonth: monthKey ? key.slice(0, 7) === monthKey.slice(0, 7) : true,
    weekend: mondayIndex(d) >= 5,
    disabled: isDisabled,
    today: key === o.today,
    selected: key === o.selected,
    background,
    dots,
  }
}

/** Six weeks of seven cells for the month of `monthKey`; days of other months carry no marks. */
export function buildMonth(monthKey: DateKey, weekStart: WeekStart, o: DayOptions): DayCell[] {
  const first = `${monthKey.slice(0, 7)}-01`
  const start = startOfWeek(first, weekStart)
  return Array.from({ length: 42 }, (_, i) => {
    const key = addDays(start, i)
    const cell = cellFor(key, first, o)
    return cell.inMonth ? cell : { ...cell, background: null, dots: [] }
  })
}

/** The seven days of the week that contains `key`. */
export function buildWeek(key: DateKey, weekStart: WeekStart, o: DayOptions): DayCell[] {
  const start = startOfWeek(key, weekStart)
  return Array.from({ length: 7 }, (_, i) => cellFor(addDays(start, i), null, o))
}

/** `count` consecutive days from `from`, for the agenda list. */
export function buildAgenda(from: DateKey, count: number, o: DayOptions): DayCell[] {
  return Array.from({ length: count }, (_, i) => cellFor(addDays(from, i), null, o))
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

/** "October 2026". */
export function monthLabel(key: DateKey): string {
  const d = fromKey(key)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "19 to 25 Oct 2026", "28 Sep to 4 Oct 2026" or "29 Dec 2026 to 4 Jan 2027". */
export function weekLabel(weekStartKey: DateKey): string {
  const a = fromKey(weekStartKey)
  const b = fromKey(addDays(weekStartKey, 6))
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()} to ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} to ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
  return `${a.getDate()} to ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
}

/** "27 October 2026", for a cell's accessible name. */
export function longDate(key: DateKey): string {
  const d = fromKey(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
