/** One weekday of a work schedule (work_schedule_days). Times are "HH:MM", Asia/Phnom_Penh. */
export interface DaySchedule {
  /** ISO weekday: 1 = Monday .. 7 = Sunday. */
  isoDow: number
  isWorking: boolean
  start: string
  end: string
  breakMinutes: number
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fromMinutes(total: number): string {
  const v = ((Math.round(total) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

/** Hours worked on a day: end − start, minus the break unless it's paid. 0 on a day off. */
export function dayHours(day: DaySchedule, breakPaid: boolean): number {
  if (!day.isWorking) return 0
  return Math.max(0, toMinutes(day.end) - toMinutes(day.start) - (breakPaid ? 0 : day.breakMinutes)) / 60
}

export function weekHours(days: DaySchedule[], breakPaid: boolean): number {
  return days.reduce((sum, d) => sum + dayHours(d, breakPaid), 0)
}

/** "8 h", "7.5 h". */
export function formatHours(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
}

/** "Mon – Fri" for a run of consecutive days, "Mon, Wed, Fri" otherwise, "Monday" for one, "No working days" for none. */
export function workingDaysLabel(days: DaySchedule[]): string {
  const on = days.filter((d) => d.isWorking).map((d) => d.isoDow).sort((a, b) => a - b)
  if (on.length === 0) return 'No working days'
  if (on.length === 1) return DAY_NAMES[on[0] - 1]
  const consecutive = on.every((v, i) => i === 0 || v === on[i - 1] + 1)
  return consecutive ? `${DAY_SHORT[on[0] - 1]} – ${DAY_SHORT[on[on.length - 1] - 1]}` : on.map((d) => DAY_SHORT[d - 1]).join(', ')
}

/** "08:30 – 17:00" when every working day has the same hours, else null. */
export function commonHours(days: DaySchedule[]): { start: string; end: string } | null {
  const on = days.filter((d) => d.isWorking)
  if (on.length === 0) return null
  return on.every((d) => d.start === on[0].start && d.end === on[0].end) ? { start: on[0].start, end: on[0].end } : null
}

/** Problems that would make the save fail (end before start, no working day). Empty when fine. */
export function scheduleProblems(days: DaySchedule[]): string[] {
  const problems: string[] = []
  if (!days.some((d) => d.isWorking)) problems.push('Pick at least one working day.')
  for (const d of days) {
    if (toMinutes(d.end) <= toMinutes(d.start)) problems.push(`${DAY_NAMES[d.isoDow - 1]} ends before it starts.`)
  }
  return problems
}

/** A fresh Mon–Fri schedule copied from given hours (used when adding a team schedule). */
export function weekFrom(start: string, end: string, breakMinutes: number): DaySchedule[] {
  return [1, 2, 3, 4, 5, 6, 7].map((isoDow) => ({ isoDow, isWorking: isoDow <= 5, start, end, breakMinutes }))
}
