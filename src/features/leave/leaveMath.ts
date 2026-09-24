import type { LeaveDayPeriod } from './types'

/**
 * Client-side mirror of app.leave_request_days (0084_footprints_leave_day_period.sql)
 * -- used only for a live day-count preview in the request form. The
 * server-side function is the actual source of truth (it's what
 * app.request_leave and leave_balance_summary both use), this just needs
 * to agree with it.
 */
export function leaveRequestDays(startDate: string, endDate: string, startPeriod: LeaveDayPeriod, endPeriod: LeaveDayPeriod): number {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const wholeDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
  return wholeDays - (startPeriod !== 'full' ? 0.5 : 0) - (endPeriod !== 'full' ? 0.5 : 0)
}
