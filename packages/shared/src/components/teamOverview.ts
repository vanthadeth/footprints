import type { LeaveCode } from './attendance'
import type { StripDay } from './dayStrip'
import { money } from './roster'

/** `waiting`: no clock-in yet but not due (before start time plus grace), or a day off; counted in the team, in no tile. */
export type PersonState = 'in' | 'leave' | 'absent' | 'waiting'
export type OverviewFilter = 'all' | 'in' | 'leave' | 'absent' | 'late'

export const NO_DEPARTMENT = 'No department'

export interface PersonInfo {
  /** Different customers visited today. */
  uniqueVisits: number
  /** Orders today; a synced sale order counts once however many visits matched it. */
  orders: number
  amountUsd: number
}

export interface OverviewPerson {
  id: string
  name: string
  department: string
  state: PersonState
  /** Minutes late in; only for someone clocked in. */
  lateMinutes: number
  /** Only for someone on leave. */
  leaveCode?: LeaveCode
  /** Only for someone waiting: "Starts at 08:00" or "Day off". */
  note?: string
  /** First clock-in as "HH:MM", for the row's label. */
  clockIn?: string
  /** The day so far, for someone clocked in. */
  strip?: StripDay
  visits?: number
  /** The day's numbers, for someone clocked in. */
  info?: PersonInfo
}

export const initials = (name: string): string => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return ((w[0][0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

export interface OverviewKpis {
  total: number
  clockedIn: number
  onLeave: number
  /** Leave by type, only the types that occur, in AL, SL, UL, FD order. */
  leaveSplit: { code: LeaveCode; count: number }[]
  absent: number
  /** People who clocked in late; they are also counted as clocked in. */
  late: number
  lateMinutes: number
}

const LEAVE_ORDER: LeaveCode[] = ['AL', 'SL', 'UL', 'FD']

export function overviewKpis(people: OverviewPerson[]): OverviewKpis {
  const leaving = people.filter((p) => p.state === 'leave')
  const late = people.filter((p) => p.state === 'in' && p.lateMinutes > 0)
  return {
    total: people.length,
    clockedIn: people.filter((p) => p.state === 'in').length,
    onLeave: leaving.length,
    leaveSplit: LEAVE_ORDER.map((code) => ({ code, count: leaving.filter((p) => p.leaveCode === code).length })).filter((x) => x.count > 0),
    absent: people.filter((p) => p.state === 'absent').length,
    late: late.length,
    lateMinutes: late.reduce((n, p) => n + p.lateMinutes, 0),
  }
}

export const isLate = (p: OverviewPerson) => p.state === 'in' && p.lateMinutes > 0

export function filterPeople(people: OverviewPerson[], filter: OverviewFilter): OverviewPerson[] {
  if (filter === 'all') return people
  if (filter === 'late') return people.filter(isLate)
  return people.filter((p) => p.state === filter)
}

const rank = (p: OverviewPerson) => (p.state === 'absent' ? 0 : isLate(p) ? 1 : p.state === 'in' ? 2 : p.state === 'waiting' ? 3 : 4)

/** Needs attention first: absent, then late (most minutes first), then clocked in, then waiting, then on leave; by name within each. */
export function sortPeople(people: OverviewPerson[]): OverviewPerson[] {
  return [...people].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.lateMinutes - a.lateMinutes : 0) || a.name.localeCompare(b.name))
}

export interface OverviewGroup {
  name: string
  people: OverviewPerson[]
}

/** People by department, alphabetical with "No department" last; inside a department, absent first, then late, clocked in, waiting, on leave. */
export function groupByDepartment(people: OverviewPerson[]): OverviewGroup[] {
  const names = [...new Set(people.map((p) => p.department || NO_DEPARTMENT))].sort((a, b) => (a === NO_DEPARTMENT ? 1 : b === NO_DEPARTMENT ? -1 : a.localeCompare(b)))
  return names.map((name) => ({ name, people: sortPeople(people.filter((p) => (p.department || NO_DEPARTMENT) === name)) }))
}

export type ChipTone = 'ok' | 'amb' | 'bad' | 'mu'

const LEAVE_NAME: Record<LeaveCode, string> = { AL: 'Annual leave', SL: 'Sick leave', UL: 'Unpaid leave', FD: 'Flexible day off' }

/** The line under the name on a person's card. */
export function statusLine(p: OverviewPerson): string {
  if (p.state === 'in') return p.clockIn ? `Clocked in ${p.clockIn}` : 'Clocked in'
  if (p.state === 'leave') return p.leaveCode ? LEAVE_NAME[p.leaveCode] : 'On leave'
  if (p.state === 'absent') return 'No clock-in yet'
  return p.note ?? 'Not clocked in yet'
}

/** The chip on the right of a person's card. */
export function statusChip(p: OverviewPerson): { text: string; tone: ChipTone } {
  if (p.state === 'in') return isLate(p) ? { text: `Late ${p.lateMinutes}m`, tone: 'amb' } : { text: 'On time', tone: 'ok' }
  if (p.state === 'leave') return { text: p.leaveCode ? `On leave · ${p.leaveCode}` : 'On leave', tone: 'mu' }
  if (p.state === 'absent') return { text: 'Absent', tone: 'bad' }
  return { text: p.note === 'Day off' ? 'Day off' : 'Not due yet', tone: 'mu' }
}

/** "5 unique visits", "1 order", "3 orders". */
export const infoPills = (i: PersonInfo): { text: string; amount?: boolean }[] => [
  { text: `${i.uniqueVisits} unique ${i.uniqueVisits === 1 ? 'visit' : 'visits'}` },
  { text: `${i.orders} ${i.orders === 1 ? 'order' : 'orders'}` },
  { text: money(i.amountUsd), amount: true },
]

export const leaveSplitText = (k: OverviewKpis) => k.leaveSplit.map((x) => `${x.code} ${x.count}`).join(' · ')

export interface Measure {
  value: number
  target: number | null
  /** Rounded percent of the target; null without a target. */
  percent: number | null
  /** Bar fill, 0-100. */
  fill: number
}

export interface PerformanceInput {
  sales: number
  salesTarget: number | null
  visits: number
  visitTarget: number | null
  newCustomers: number
  newTarget: number | null
}

export interface Performance {
  sales: Measure
  visits: Measure
  newCustomers: Measure
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function measure(value: number, target: number | null): Measure {
  if (!target || target <= 0) return { value, target: null, percent: null, fill: 0 }
  const percent = Math.round((value / target) * 100)
  return { value, target, percent, fill: clamp(percent, 0, 100) }
}

/** The team's day against its targets. Pace is left to the monthly report. */
export function performance(i: PerformanceInput): Performance {
  return {
    sales: measure(i.sales, i.salesTarget),
    visits: measure(i.visits, i.visitTarget),
    newCustomers: measure(i.newCustomers, i.newTarget),
  }
}
