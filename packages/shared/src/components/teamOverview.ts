import type { LeaveCode } from './attendance'
import type { StripDay } from './dayStrip'
import { money } from './roster'

/** `waiting`: no clock-in yet but not due (before start time plus grace), or a day off; counted in the team, in no tile. */
export type PersonState = 'in' | 'leave' | 'absent' | 'waiting'
export type OverviewFilter = 'all' | 'in' | 'leave' | 'absent' | 'late'

export interface OverviewPerson {
  id: string
  name: string
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

export const leaveSplitText = (k: OverviewKpis) => k.leaveSplit.map((x) => `${x.code} ${x.count}`).join(' · ')

export type Tone = 'ok' | 'warn' | 'bad'

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
  /** How much of the working day has passed, 0-1; where the pace tick sits on the sales bar. */
  paceFraction: number
}

export interface Performance {
  sales: Measure & {
    /** Where the person should be by now, percent of the bar. Null without a target. */
    pace: number | null
    tone: Tone | null
    /** Money ahead of (positive) or behind (negative) the pace. */
    diff: number | null
    chip: string
  }
  visits: Measure
  newCustomers: Measure
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function measure(value: number, target: number | null): Measure {
  if (!target || target <= 0) return { value, target: null, percent: null, fill: 0 }
  const percent = Math.round((value / target) * 100)
  return { value, target, percent, fill: clamp(percent, 0, 100) }
}

/** Colour follows pace, not the raw percent: on or ahead of pace is ok, within 15% behind is warn, further behind is bad. */
export function paceTone(value: number, target: number, paceFraction: number): Tone {
  const expected = target * clamp(paceFraction, 0, 1)
  if (expected <= 0 || value >= expected) return 'ok'
  return value / expected >= 0.85 ? 'warn' : 'bad'
}

export function performance(i: PerformanceInput): Performance {
  const sales = measure(i.sales, i.salesTarget)
  const pace = clamp(i.paceFraction, 0, 1)
  const hasTarget = sales.target != null
  const expected = hasTarget ? sales.target! * pace : 0
  const diff = hasTarget ? Math.round(i.sales - expected) : null
  return {
    sales: {
      ...sales,
      pace: hasTarget ? pace * 100 : null,
      tone: hasTarget ? paceTone(i.sales, sales.target!, pace) : null,
      diff,
      chip: diff == null ? 'No sales target set' : `${money(Math.abs(diff))} ${diff >= 0 ? 'ahead of pace' : 'behind pace'}`,
    },
    visits: measure(i.visits, i.visitTarget),
    newCustomers: measure(i.newCustomers, i.newTarget),
  }
}
