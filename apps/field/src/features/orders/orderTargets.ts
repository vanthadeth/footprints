import { TARGET_WORKING_DAYS_PER_MONTH } from '@footprints/shared/lib/config'

/** Days a person is expected to work (not leave, a holiday or a day off). `upcoming` is a working day still to come. */
export const WORKING_STATUS = new Set(['present', 'late', 'absent', 'upcoming'])

/** First and last day of the month `today` ("YYYY-MM-DD") is in. */
export function monthBounds(today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

/**
 * A person's monthly sales target in USD, or null when they have none: switched off, or neither their own nor the
 * company's is above zero. Their own target wins over the company's; 0 on their own means none.
 */
export function resolveMonthly(own: number | null, required: boolean, companyMonthly: number): number | null {
  if (!required) return null
  const v = own ?? companyMonthly
  return v > 0 ? v : null
}

/** Distinct working days of one person in the rows (the month's attendance_days). */
export function workingDaysOf(rows: { userId: string; day: string; status: string }[], userId: string): number {
  return new Set(rows.filter((r) => r.userId === userId && WORKING_STATUS.has(r.status)).map((r) => r.day)).size
}

/**
 * The day's share of a monthly target for a full working day: the target divided by the person's working days in the month
 * (a standard month when their days are not known). 0 when there is no target.
 */
export function dailyEquivalent(monthly: number | null, workingDays: number): number {
  if (monthly == null || monthly <= 0) return 0
  return monthly / (workingDays > 0 ? workingDays : TARGET_WORKING_DAYS_PER_MONTH)
}

export interface PersonTarget {
  /** Null: no target (switched off, or none set anywhere). */
  monthly: number | null
  /** The day's share of it; 0 when there is no target. */
  daily: number
  /** Whether the person has to achieve a sales target. */
  required: boolean
}

/** Everyone's target from the RPC rows, the company default and the month's attendance rows. */
export function personTargets(
  rows: { userId: string; monthly: number | null; required: boolean }[],
  companyMonthly: number,
  monthRows: { userId: string; day: string; status: string }[]
): Record<string, PersonTarget> {
  const out: Record<string, PersonTarget> = {}
  for (const r of rows) {
    const monthly = resolveMonthly(r.monthly, r.required, companyMonthly)
    out[r.userId] = { monthly, daily: dailyEquivalent(monthly, workingDaysOf(monthRows, r.userId)), required: r.required }
  }
  return out
}
