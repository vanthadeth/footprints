/** A public_holidays row in app shape. Dates are "YYYY-MM-DD". */
export interface Holiday {
  id: string
  name: string
  startDate: string
  endDate: string
  kind: 'public' | 'company'
  halfDay: boolean
  /** null = everyone. */
  departmentIds: string[] | null
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function holidayDayCount(h: Pick<Holiday, 'startDate' | 'endDate' | 'halfDay'>): number {
  const ms = Date.parse(h.endDate + 'T00:00:00Z') - Date.parse(h.startDate + 'T00:00:00Z')
  const days = Math.round(ms / 86_400_000) + 1
  return h.halfDay ? days / 2 : days
}

/** Holidays grouped by the month they start in, in date order. */
export function groupByMonth(holidays: Holiday[]): { month: number; label: string; items: Holiday[] }[] {
  const sorted = [...holidays].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const groups = new Map<number, Holiday[]>()
  for (const h of sorted) {
    const m = Number(h.startDate.slice(5, 7)) - 1
    groups.set(m, [...(groups.get(m) ?? []), h])
  }
  return [...groups.entries()].map(([month, items]) => ({ month, label: MONTH_NAMES[month], items }))
}

/** The next holiday that hasn't finished yet (today counts), or null. */
export function nextHoliday(holidays: Holiday[], today: string): Holiday | null {
  return [...holidays].filter((h) => h.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
}

export function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000)
}

/**
 * Cambodia's fixed-date public holidays for a year -- a starting point to
 * check against the government's announcement. Lunar-calendar holidays
 * (Visak Bochea, Royal Ploughing Ceremony, Pchum Ben, Water Festival) move
 * every year, so they aren't included; add them once dates are announced.
 */
export function suggestedCambodiaHolidays(year: number): Omit<Holiday, 'id'>[] {
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const one = (name: string, m: number, day: number) => ({ name, startDate: d(m, day), endDate: d(m, day), kind: 'public' as const, halfDay: false, departmentIds: null })
  return [
    one('International New Year Day', 1, 1),
    one('Victory over Genocide Day', 1, 7),
    one('International Women’s Day', 3, 8),
    { name: 'Khmer New Year', startDate: d(4, 14), endDate: d(4, 16), kind: 'public', halfDay: false, departmentIds: null },
    one('International Labour Day', 5, 1),
    one('King’s Birthday', 5, 14),
    one('Constitution Day', 9, 24),
    one('King Father’s Commemoration Day', 10, 15),
    one('Independence Day', 11, 9),
  ]
}
