import { addDays, fromKey, longDate, startOfWeek, toKey, type DateKey } from './calendar'
import { LEAVE_NAMES, addToSummary, dayMark, emptySummary, minutesText, type AttendanceRecord, type AttendanceSummary, type MarkContext, type MarkKind } from './attendance'

export interface RosterPerson {
  id: string
  name: string
  department: string
}

/** What a person did on a day, for the team calendar's visits and orders. */
export interface Activity {
  visits: number
  orders: { count: number; amount: number }
  collection: { count: number; amount: number }
  appointments: number
}

export interface RosterData {
  people: RosterPerson[]
  /** Attendance results by person id, then date. */
  records: Record<string, Record<DateKey, AttendanceRecord>>
  /** Visits and orders by person id, then date (the team calendar only). */
  activity?: Record<string, Record<DateKey, Activity>>
  holidays?: DateKey[]
  today: DateKey
}

/** `attendance`: a check, a leave code, A or minutes in each cell. `activity`: colour for the result and a dot for a day with visits. */
export type RosterMode = 'attendance' | 'activity'

export interface RosterCell {
  key: DateKey
  kind: MarkKind
  /** Leave code, A, minutes, or in the week of the activity mode "visits · $amount". */
  text: string
  check: boolean
  /** Half a day of leave: a ½ next to the mark. */
  half: boolean
  /** A day with visits (activity mode, month). */
  dot: boolean
  /** Accessible name. */
  label: string
}

export interface RosterRow {
  person: RosterPerson
  cells: RosterCell[]
  /** Totals over the row's days. */
  summary: AttendanceSummary
}

export interface RosterGroup {
  name: string
  rows: RosterRow[]
}

export const money = (n: number) => `$${n.toLocaleString('en-US')}`

const attended = (k: MarkKind) => k === 'present' || k === 'late'

export function rosterCell(key: DateKey, person: RosterPerson, data: RosterData, mode: RosterMode, detail: 'month' | 'week'): RosterCell {
  const ctx: MarkContext = { today: data.today, holidays: data.holidays }
  const mark = dayMark(key, ctx, data.records[person.id]?.[key])
  const act = data.activity?.[person.id]?.[key]
  const base = { key, kind: mark.kind, label: `${person.name}, ${longDate(key)}${mark.label ? `: ${mark.label}` : ''}` }
  if (mode === 'attendance') return { ...base, text: mark.text, check: mark.kind === 'present', half: mark.half, dot: false }
  const text = detail === 'week' && attended(mark.kind) && act ? `${act.visits} · ${money(act.orders.amount)}` : ''
  return { ...base, text, check: false, half: false, dot: detail === 'month' && attended(mark.kind) && !!act && act.visits > 0 }
}

/** People grouped by department (in order of first appearance), one cell per day. */
export function buildRoster(data: RosterData, days: DateKey[], mode: RosterMode, detail: 'month' | 'week'): RosterGroup[] {
  const ctx: MarkContext = { today: data.today, holidays: data.holidays }
  const groups: RosterGroup[] = []
  for (const person of data.people) {
    let g = groups.find((x) => x.name === person.department)
    if (!g) groups.push((g = { name: person.department, rows: [] }))
    const summary = emptySummary()
    for (const d of days) {
      const rec = data.records[person.id]?.[d]
      addToSummary(summary, dayMark(d, ctx, rec), rec)
    }
    g.rows.push({ person, cells: days.map((d) => rosterCell(d, person, data, mode, detail)), summary })
  }
  return groups
}

/** The days of the month that contains `key`. */
export function monthDays(key: DateKey): DateKey[] {
  const first = fromKey(`${key.slice(0, 7)}-01`)
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return Array.from({ length: count }, (_, i) => toKey(new Date(first.getFullYear(), first.getMonth(), i + 1)))
}

/** Seven days from `start`. */
export function weekDays(start: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The first and last date shown for a month or week around `cursor` (weeks start on Monday). */
export function visibleRange(view: 'month' | 'week', cursor: DateKey): { from: DateKey; to: DateKey } {
  const days = view === 'month' ? monthDays(cursor) : weekDays(startOfWeek(cursor, 'mon'))
  return { from: days[0], to: days[days.length - 1] }
}

/** Totals over every row. */
export function teamSummary(groups: RosterGroup[]): AttendanceSummary {
  const s = emptySummary()
  for (const g of groups) for (const r of g.rows) {
    s.present += r.summary.present
    s.late += r.summary.late
    s.lateMinutes += r.summary.lateMinutes
    s.leave += r.summary.leave
    s.absent += r.summary.absent
    s.workingDays += r.summary.workingDays
  }
  s.rate = s.workingDays ? Math.round(((s.present + s.late) / s.workingDays) * 100) : 0
  return s
}

export interface Kpi {
  value: string
  label: string
  sub: string
  tone: 'present' | 'late' | 'leave' | 'absent' | 'plain'
}

export interface Targets {
  /** Visits per person per attended day. */
  visits: number
  /** Order amount per person per attended day. */
  orders: number
}

/** The tiles above the roster. The attendance mode has four, the activity mode five. */
export function teamKpis(groups: RosterGroup[], data: RosterData, days: DateKey[], mode: RosterMode, targets: Targets): Kpi[] {
  const s = teamSummary(groups)
  const attendedDays = s.present + s.late
  const rate: Kpi = { value: `${s.rate}%`, label: 'Attendance', sub: `${attendedDays} of ${s.workingDays} person-days`, tone: 'present' }
  if (mode === 'attendance') {
    return [
      rate,
      { value: String(s.late), label: 'Late or early', sub: `${s.lateMinutes} min in total`, tone: 'late' },
      { value: String(s.leave), label: 'Leave days', sub: 'AL, UL and SL', tone: 'leave' },
      { value: String(s.absent), label: 'Absent days', sub: 'no clock-in, no leave', tone: 'absent' },
    ]
  }
  let visits = 0
  let orders = 0
  for (const p of data.people) for (const d of days) {
    const a = data.activity?.[p.id]?.[d]
    if (a) {
      visits += a.visits
      orders += a.orders.amount
    }
  }
  const visitTarget = attendedDays * targets.visits
  const orderTarget = attendedDays * targets.orders
  const pct = (v: number, t: number) => (t ? `${Math.round((v / t) * 100)}%` : '-')
  return [
    rate,
    { value: String(s.late), label: 'Late days', sub: 'clock in after start', tone: 'late' },
    { value: `${s.leave} · ${s.absent}`, label: 'Leave · absent', sub: 'person-days', tone: 'leave' },
    { value: pct(visits, visitTarget), label: 'Visits vs target', sub: `${visits} of ${visitTarget}`, tone: 'plain' },
    { value: money(orders), label: 'Orders', sub: `${pct(orders, orderTarget)} of ${money(orderTarget)}`, tone: 'plain' },
  ]
}

export interface DayPerson {
  person: RosterPerson
  kind: MarkKind
  /** "On time", "Late 8m", "Annual leave", "Absent", "Holiday". */
  chip: string
  activity?: Activity
}

export interface DayList {
  counts: { present: number; late: number; leave: number; absent: number }
  people: DayPerson[]
  /** Activity mode: the day's visits against the target, and the order, collection and appointment totals. */
  totals: { visits: number; visitTarget: number; orders: Activity['orders']; collection: Activity['collection']; appointments: number }
}

/** One date for the whole team: counts, a status chip per person, and the day's totals. */
export function dayList(data: RosterData, key: DateKey, targets: Targets): DayList {
  const ctx: MarkContext = { today: data.today, holidays: data.holidays }
  const counts = { present: 0, late: 0, leave: 0, absent: 0 }
  const totals: DayList['totals'] = { visits: 0, visitTarget: 0, orders: { count: 0, amount: 0 }, collection: { count: 0, amount: 0 }, appointments: 0 }
  const people = data.people.map((person): DayPerson => {
    const rec = data.records[person.id]?.[key]
    const mark = dayMark(key, ctx, rec)
    const activity = data.activity?.[person.id]?.[key]
    if (mark.kind === 'present' || mark.kind === 'late' || mark.kind === 'leave' || mark.kind === 'absent') counts[mark.kind]++
    if (attended(mark.kind)) {
      totals.visitTarget += targets.visits
      if (activity) {
        totals.visits += activity.visits
        totals.orders.count += activity.orders.count
        totals.orders.amount += activity.orders.amount
        totals.collection.count += activity.collection.count
        totals.collection.amount += activity.collection.amount
        totals.appointments += activity.appointments
      }
    }
    const chip =
      mark.kind === 'present' ? `On time${mark.half ? ' ½' : ''}`
      : mark.kind === 'late' && rec?.result === 'late' ? `Late ${minutesText(rec.minutes)}${mark.half ? ' ½' : ''}`
      : mark.kind === 'leave' && rec?.result === 'leave' ? `${LEAVE_NAMES[rec.code]}${rec.half ? ' ½' : ''}`
      : mark.kind === 'absent' ? 'Absent'
      : mark.kind === 'dayoff' ? 'Day off'
      : mark.kind === 'holiday' ? 'Holiday'
      : mark.kind === 'weekend' ? 'Weekend'
      : '-'
    return { person, kind: mark.kind, chip, activity }
  })
  return { counts, people, totals }
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Friday 16 Oct 2026". */
export function dayTitle(key: DateKey): string {
  const d = fromKey(key)
  return `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
