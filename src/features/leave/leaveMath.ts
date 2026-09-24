/**
 * Client-side mirror of app.leave_request_days (0080_footprints_leave_schema.sql)
 * -- used only for a live day-count preview in the request form. The
 * server-side function is the actual source of truth (it's what
 * app.request_leave and leave_balance_summary both use), this just needs
 * to agree with it.
 */
export function leaveRequestDays(startDate: string, endDate: string, startHalfDay: boolean, endHalfDay: boolean): number {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const wholeDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
  return wholeDays - (startHalfDay ? 0.5 : 0) - (endHalfDay ? 0.5 : 0)
}
