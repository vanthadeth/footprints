import { APP_TIMEZONE } from './config'

export type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

export interface DateRange {
  /** Inclusive start, exclusive end -- both ISO instants, ready for a `gte`/`lt` query. */
  startIso: string
  endIso: string
  label: string
}

/** Midnight (00:00:00) for a given calendar date, expressed in `timezone`. */
function zonedMidnightIso(year: number, month: number, day: number, timezone: string): string {
  // Binary-search the UTC offset rather than assuming one, so this stays
  // correct across any DST transition in `timezone`.
  let utcMs = Date.UTC(year, month, day)
  for (let i = 0; i < 3; i++) {
    const asZoned = new Date(utcMs).toLocaleString('en-US', { timeZone: timezone })
    const zoned = new Date(asZoned)
    const wanted = new Date(Date.UTC(year, month, day, 0, 0, 0))
    const diff = wanted.getTime() - Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), zoned.getHours(), zoned.getMinutes(), zoned.getSeconds())
    utcMs += diff
  }
  return new Date(utcMs).toISOString()
}

function zonedTodayParts(timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date()
  )
  return {
    year: Number(parts.find((p) => p.type === 'year')!.value),
    month: Number(parts.find((p) => p.type === 'month')!.value) - 1,
    day: Number(parts.find((p) => p.type === 'day')!.value),
  }
}

function addDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month, day + delta))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
}

/** Weekday index with Monday=0 .. Sunday=6, matching the Cambodian business week start. */
function mondayIndex(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month, day)).getUTCDay() // Sun=0..Sat=6
  return (jsDay + 6) % 7
}

export function getPresetRange(preset: Exclude<DateRangePreset, 'custom'>, timezone: string = APP_TIMEZONE): DateRange {
  const today = zonedTodayParts(timezone)

  switch (preset) {
    case 'today': {
      const next = addDays(today.year, today.month, today.day, 1)
      return {
        startIso: zonedMidnightIso(today.year, today.month, today.day, timezone),
        endIso: zonedMidnightIso(next.year, next.month, next.day, timezone),
        label: 'Today',
      }
    }
    case 'yesterday': {
      const y = addDays(today.year, today.month, today.day, -1)
      return {
        startIso: zonedMidnightIso(y.year, y.month, y.day, timezone),
        endIso: zonedMidnightIso(today.year, today.month, today.day, timezone),
        label: 'Yesterday',
      }
    }
    case 'this_week': {
      const start = addDays(today.year, today.month, today.day, -mondayIndex(today.year, today.month, today.day))
      const end = addDays(start.year, start.month, start.day, 7)
      return {
        startIso: zonedMidnightIso(start.year, start.month, start.day, timezone),
        endIso: zonedMidnightIso(end.year, end.month, end.day, timezone),
        label: 'This Week',
      }
    }
    case 'last_week': {
      const startThis = addDays(today.year, today.month, today.day, -mondayIndex(today.year, today.month, today.day))
      const start = addDays(startThis.year, startThis.month, startThis.day, -7)
      return {
        startIso: zonedMidnightIso(start.year, start.month, start.day, timezone),
        endIso: zonedMidnightIso(startThis.year, startThis.month, startThis.day, timezone),
        label: 'Last Week',
      }
    }
    case 'this_month': {
      const next = today.month === 11 ? { year: today.year + 1, month: 0 } : { year: today.year, month: today.month + 1 }
      return {
        startIso: zonedMidnightIso(today.year, today.month, 1, timezone),
        endIso: zonedMidnightIso(next.year, next.month, 1, timezone),
        label: 'This Month',
      }
    }
    case 'last_month': {
      const prev = today.month === 0 ? { year: today.year - 1, month: 11 } : { year: today.year, month: today.month - 1 }
      return {
        startIso: zonedMidnightIso(prev.year, prev.month, 1, timezone),
        endIso: zonedMidnightIso(today.year, today.month, 1, timezone),
        label: 'Last Month',
      }
    }
  }
}

/** "YYYY-MM-DD" for today's calendar date in `timezone` -- the upper bound for anything day-picker related (you can't view a journey that hasn't happened yet). */
export function todayDateString(timezone: string = APP_TIMEZONE): string {
  const { year, month, day } = zonedTodayParts(timezone)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The `n` calendar dates ("YYYY-MM-DD") ending at (and including) `endDate`, oldest first -- backs the Footprints 7-day picker strip. */
export function lastNDaysEnding(endDate: string, n: number): string[] {
  const [y, m, d] = endDate.split('-').map(Number)
  const dates: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const { year, month, day } = addDays(y, m - 1, d, -i)
    dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }
  return dates
}

/** A user-picked [from, to] custom range, both calendar dates (YYYY-MM-DD) in `timezone`. */
export function getCustomRange(fromDate: string, toDate: string, timezone: string = APP_TIMEZONE): DateRange {
  const [fy, fm, fd] = fromDate.split('-').map(Number)
  const [ty, tm, td] = toDate.split('-').map(Number)
  const end = addDays(ty, tm - 1, td, 1)
  return {
    startIso: zonedMidnightIso(fy, fm - 1, fd, timezone),
    endIso: zonedMidnightIso(end.year, end.month, end.day, timezone),
    label: `${fromDate} – ${toDate}`,
  }
}
