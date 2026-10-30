import { enT, type Tr } from '@/features/customers/book'
import type { LeaveDayPeriod } from './types'

/** "YYYY-MM-DD" -> "dd/mm/yyyy" -- plain string manipulation, deliberately not routed through `new Date(...)`/formatDate: a date-only string like this has no timezone of its own, and parsing it as UTC before re-rendering in APP_TIMEZONE risks an off-by-one shift depending on the viewer's/server's offset. */
export function formatLeaveDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

/** " (morning)"/" (afternoon)" suffix for a date label, blank for a full day. */
function periodSuffix(period: LeaveDayPeriod, t: Tr): string {
  return period === 'full' ? '' : ` (${t(period === 'morning' ? 'leave.sufMorning' : 'leave.sufAfternoon')})`
}

/**
 * A leave request's date range, annotated with which half applies. For a
 * single-day request, start_period/end_period both describe that same
 * date -- whichever one isn't 'full' is the one that actually matters.
 */
export function leaveDateRangeLabel(startDate: string, endDate: string, startPeriod: LeaveDayPeriod, endPeriod: LeaveDayPeriod, t: Tr = enT): string {
  if (startDate === endDate) {
    const period = startPeriod !== 'full' ? startPeriod : endPeriod
    return `${formatLeaveDate(startDate)}${periodSuffix(period, t)}`
  }
  return `${formatLeaveDate(startDate)}${periodSuffix(startPeriod, t)} → ${formatLeaveDate(endDate)}${periodSuffix(endPeriod, t)}`
}
