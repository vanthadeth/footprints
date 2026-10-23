/**
 * A day can have several clock-in / clock-out sessions (a lunch break, a
 * split shift). These read a day's sessions as one working day: when it
 * started, how long was on the clock, and when it ended.
 */
export interface ClockSession {
  clock_in_at: string
  clock_out_at: string | null
}

/** The first clock-in of the day; null with no sessions. */
export function firstClockIn(sessions: ClockSession[]): string | null {
  return sessions.reduce<string | null>((first, s) => (first == null || s.clock_in_at < first ? s.clock_in_at : first), null)
}

/** The last clock-out once every session is closed; null with none, or while one is still open. */
export function lastClockOut(sessions: ClockSession[]): string | null {
  if (!sessions.length || sessions.some((s) => !s.clock_out_at)) return null
  return sessions.reduce((last, s) => (s.clock_out_at! > last ? s.clock_out_at! : last), sessions[0].clock_out_at!)
}

/** Time on the clock across every session; an open one counts up to now. Gaps between sessions don't count. */
export function workedMs(sessions: ClockSession[], now: number = Date.now()): number {
  return sessions.reduce((n, s) => n + Math.max(0, (s.clock_out_at ? Date.parse(s.clock_out_at) : now) - Date.parse(s.clock_in_at)), 0)
}
