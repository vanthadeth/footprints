import { displayName } from '@footprints/shared/lib/displayName'
import { formatTime } from '@footprints/shared/lib/datetime'
import type { LeaveCode } from '@footprints/shared/components/attendance'
import type { StripDay } from '@footprints/shared/components/dayStrip'
import { NO_DEPARTMENT, performance, type MonthInput, type OverviewPerson, type Performance } from '@footprints/shared/components/teamOverview'
import { firstClockIn, lastClockOut } from '@/features/attendance/sessions'
import { visitSpan } from '@/features/attendance/flagRules'
import type { FleetMemberSnapshot } from '@/features/fleet/types'
import type { LeaveType } from '@/features/leave/types'
import { orderSummary, orderValueUsd } from '@/features/attendance/effectivenessScore'
import { WORKING_STATUS } from '@/features/orders/orderTargets'
import type { OrderState } from '@/features/orders/orderReconcile'

const LEAVE_CODE: Record<LeaveType, LeaveCode> = { annual: 'AL', unpaid: 'UL', sick: 'SL', flex: 'FD' }

export interface WorkDayLike {
  isWorking: boolean
  start: string
  end: string
}

export interface OverviewInput {
  /** The people to show: everyone the viewer manages who works in the field. */
  snapshots: FleetMemberSnapshot[]
  /** Approved leave today, by user id. */
  leave: Record<string, LeaveType>
  /** Each person's own work day today; people missing here use `defaults`. */
  workDays: Record<string, WorkDayLike>
  defaults: { start: string; end: string }
  /** Minutes after start time before a clock-in counts as late (and before no clock-in counts as absent). */
  graceMin: number
  forgottenCapMin: number
  /** Epoch ms. */
  now: number
  /** The order state and synced sale order of each visit, for each person's orders and amount. */
  orderStates?: Record<string, OrderState>
  orderTotals?: Record<string, { orderNo: string; totalUsd: number | null }>
}

export interface Overview {
  people: OverviewPerson[]
  /** People expected to work today: not on leave, not on a day off. Targets are summed over them. */
  expectedIds: string[]
}

/** "HH:MM" or "HH:MM:SS" as minutes after midnight. */
export const minutesOfText = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

/** The minute of the day in the app's timezone. */
export const minuteOf = (ms: number): number => minutesOfText(formatTime(new Date(ms).toISOString()))

/**
 * Today's team as the manager screen shows it. Clocked in wins over leave (the server does the same). Late is the minutes
 * between the person's start time and their first clock-in, once past the grace, so it agrees with the attendance roster.
 * No clock-in and past start plus grace is absent; before that, or on a day off, the person is "waiting".
 */
export function buildOverview(i: OverviewInput): Overview {
  const nowMinute = minuteOf(i.now)
  const expectedIds: string[] = []
  const people = i.snapshots.map((s): OverviewPerson => {
    const id = s.member.id
    const name = displayName(s.member.fullName, s.member.nickname)
    const department = s.member.departmentName?.trim() || NO_DEPARTMENT
    const wd = i.workDays[id]
    const startText = (wd?.start ?? i.defaults.start).slice(0, 5)
    const start = minutesOfText(startText)
    const end = minutesOfText(wd?.end ?? i.defaults.end)
    const firstIn = firstClockIn(s.sessions)
    const visits = s.visitsToday.filter((v) => !v.cancelled_at)
    if (firstIn) {
      expectedIds.push(id)
      const clockIn = minuteOf(Date.parse(firstIn))
      const behind = clockIn - start
      const out = lastClockOut(s.sessions)
      const strip: StripDay = {
        shiftStart: start,
        shiftEnd: end,
        clockIn,
        clockOut: out ? minuteOf(Date.parse(out)) : nowMinute,
        now: nowMinute,
        visits: visits.map((v) => {
          const [a, b] = visitSpan(v, i.now, i.forgottenCapMin)
          return { start: minuteOf(a), end: minuteOf(b) }
        }),
      }
      const orders = orderSummary(visits, i.orderStates, i.orderTotals)
      const info = { uniqueVisits: new Set(visits.map((v) => v.customer_id ?? v.id)).size, orders: orders.count, amountUsd: orders.valueUsd }
      return { id, name, department, state: 'in', lateMinutes: behind > i.graceMin ? behind : 0, clockIn: formatTime(firstIn), strip, visits: visits.length, info }
    }
    const leave = i.leave[id]
    if (leave) return { id, name, department, state: 'leave', lateMinutes: 0, leaveCode: LEAVE_CODE[leave] }
    if (wd && !wd.isWorking) return { id, name, department, state: 'waiting', lateMinutes: 0, note: 'Day off' }
    expectedIds.push(id)
    if (nowMinute > start + i.graceMin) return { id, name, department, state: 'absent', lateMinutes: 0 }
    return { id, name, department, state: 'waiting', lateMinutes: 0, note: `Starts at ${startText}` }
  })
  return { people, expectedIds }
}

/** A visit of the team, for the sales and visit counts. */
export interface TeamVisit {
  id: string
  user_id: string
  cancelled_at?: string | null
  order_amount_usd?: number | null
  checked_in_at: string
  checked_out_at: string | null
}

export interface MonthFacts {
  /** attendance_days rows of the team for the whole month. */
  rows: { userId: string; day: string; status: string }[]
  /** "YYYY-MM-DD", the app's today. */
  today: string
  /** The month's visits so far, not cancelled. */
  visits: TeamVisit[]
  orderStates: Record<string, OrderState>
  orderTotals: Record<string, { orderNo: string; totalUsd: number | null }>
  /** Each person's monthly sales target; null or missing: they have none (switched off, or none set). */
  monthlyTargets: Record<string, number | null>
  dailyVisitTarget: number
  newCustomers: number
}

/** The visits of people who have a sales target: only their sales count against the team's target. */
const targeted = (visits: TeamVisit[], has: (userId: string) => boolean) => visits.filter((v) => has(v.user_id))

/**
 * The month so far. The sales target is the sum of each person's monthly target; people with none (switched off, or none
 * set) add nothing to it, and their sales are left out of the team's sales. The visit target adds up over each person's
 * working days. Pace counts the team's working days: a day is one if anyone is expected to work it, and today is gone.
 */
export function buildMonth(f: MonthFacts): MonthInput | null {
  const expected = f.rows.filter((r) => WORKING_STATUS.has(r.status))
  if (!expected.length) return null
  const people = new Set(f.rows.map((r) => r.userId))
  const has = (id: string) => (f.monthlyTargets[id] ?? 0) > 0
  const salesTarget = [...people].reduce((n, id) => n + (has(id) ? (f.monthlyTargets[id] as number) : 0), 0)
  const days = new Set(expected.map((r) => r.day))
  const done = [...days].filter((d) => d <= f.today).length
  return {
    sales: orderSummary(targeted(f.visits, has), f.orderStates, f.orderTotals).valueUsd,
    salesTarget: salesTarget > 0 ? salesTarget : null,
    visits: f.visits.filter((v) => !v.cancelled_at).length,
    visitTarget: f.dailyVisitTarget > 0 ? expected.length * f.dailyVisitTarget : null,
    newCustomers: f.newCustomers,
    newTarget: null,
    doneDays: done,
    totalDays: days.size,
  }
}

export interface PerformanceFacts {
  overview: Overview
  /** Today's visits of the team, not cancelled. */
  visits: TeamVisit[]
  orderStates: Record<string, OrderState>
  /** The synced sale order's total per visit. */
  orderTotals: Record<string, { orderNo: string; totalUsd: number | null }>
  /** Each person's daily share of their monthly sales target; 0 or missing: they have none. */
  dailyTargets: Record<string, number>
  dailyVisitTarget: number
  newCustomers: number
  /** The month so far, when it has loaded. */
  month?: MonthInput | null
}

/**
 * The team's day against its targets. Sales are counted as the score counts them (a synced sale order once, however many
 * visits matched it, else the amount entered on a visit marked ordered) and only for people who have a sales target; the
 * target adds up their daily shares over the people expected to work today.
 */
export function buildPerformance(f: PerformanceFacts): Performance {
  const ids = f.overview.expectedIds
  const has = (id: string) => (f.dailyTargets[id] ?? 0) > 0
  const salesTarget = ids.reduce((n, id) => n + (has(id) ? f.dailyTargets[id] : 0), 0)
  return performance({
    sales: orderValueUsd(targeted(f.visits, has), f.orderStates, f.orderTotals),
    salesTarget: salesTarget > 0 ? salesTarget : null,
    visits: f.visits.length,
    visitTarget: ids.length && f.dailyVisitTarget > 0 ? ids.length * f.dailyVisitTarget : null,
    newCustomers: f.newCustomers,
    newTarget: null,
    month: f.month ?? undefined,
  })
}
