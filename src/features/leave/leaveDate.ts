/** "YYYY-MM-DD" -> "dd/mm/yyyy" -- plain string manipulation, deliberately not routed through `new Date(...)`/formatDate: a date-only string like this has no timezone of its own, and parsing it as UTC before re-rendering in APP_TIMEZONE risks an off-by-one shift depending on the viewer's/server's offset. */
export function formatLeaveDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}
