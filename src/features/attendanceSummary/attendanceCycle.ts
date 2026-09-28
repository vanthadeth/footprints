/**
 * Monthly attendance cycles. A cycle closing on day d (1–28) runs from the
 * (d+1)th of the previous month to the dth of this month -- closing on the
 * 20th covers 21 Aug – 20 Sep. d = 0 means plain calendar months. Dates are
 * "YYYY-MM-DD" strings; the maths is done on UTC dates so time zones never
 * shift a day.
 */
export interface Cycle {
  start: string
  end: string
}

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
}

/** The cycle that ends in month `monthIndex` (0-based, may overflow) of `year`. */
export function cycleEndingIn(closeDay: number, year: number, monthIndex: number): Cycle {
  if (closeDay === 0) return { start: iso(year, monthIndex, 1), end: iso(year, monthIndex + 1, 0) }
  // Day d+1 of the previous month; Date.UTC rolls 29 Feb over to 1 Mar in a 28-day year.
  return { start: iso(year, monthIndex - 1, closeDay + 1), end: iso(year, monthIndex, closeDay) }
}

/** The cycle containing `today`, stepped back (negative) or forward by `offset` cycles. */
export function cycleFor(closeDay: number, today: string, offset = 0): Cycle {
  const [y, m, d] = today.split('-').map(Number)
  const endMonth = closeDay === 0 || d <= closeDay ? m - 1 : m
  return cycleEndingIn(closeDay, y, endMonth + offset)
}

/** Every date in [start, end]. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  const [y, m, d] = start.split('-').map(Number)
  for (let i = 0; ; i++) {
    const day = iso(y, m - 1, d + i)
    if (day > end) break
    out.push(day)
  }
  return out
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "21 Aug" */
export function shortDate(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MON[m - 1]}`
}

/** "21 Aug – 20 Sep 2026" (the start year too when the cycle crosses New Year). */
export function cycleLabel(c: Cycle): string {
  const sy = c.start.slice(0, 4)
  const ey = c.end.slice(0, 4)
  return `${shortDate(c.start)}${sy !== ey ? ` ${sy}` : ''} – ${shortDate(c.end)} ${ey}`
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th'
  return `${n}${s}`
}

/** "Closes on the 20th · counts the 21st to the 20th" / "Calendar month". */
export function cycleRule(closeDay: number): string {
  return closeDay === 0 ? 'Calendar month · closes on the last day' : `Closes on the ${ordinal(closeDay)} · counts the ${ordinal(closeDay + 1)} to the ${ordinal(closeDay)}`
}

/** The Monday of the week containing `day`, stepped by `offset` weeks. */
export function weekStart(day: string, offset = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const back = (dow + 6) % 7
  return iso(y, m - 1, d - back + offset * 7)
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return iso(y, m - 1, d + n)
}
