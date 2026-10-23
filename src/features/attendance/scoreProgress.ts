/**
 * Momentum from a person's daily scores: how many working days in a row at Good or better,
 * the best week and best day so far. Days with no score (not clocked in) neither add to a
 * streak nor break it; a day below Good does.
 */

export const STREAK_SCORE = 7
/** A personal best needs this many earlier scored days / days in the week to mean something. */
const MIN_HISTORY_DAYS = 3
const MIN_WEEK_DAYS = 2

export interface ScoredDay {
  date: string
  score: number | null
}

export interface WeekMean {
  /** The Monday of the week ("YYYY-MM-DD"). */
  start: string
  mean: number
  days: number
}

export interface ScoreProgress {
  /** Working days in a row at STREAK_SCORE or better, up to the latest finished day (today counts only once it reaches it). */
  streak: number
  bestStreak: number
  thisWeek: WeekMean | null
  /** The best earlier week. */
  bestWeek: WeekMean | null
  /** This week's mean beats every earlier week. */
  newBestWeek: boolean
  bestDay: { date: string; score: number } | null
}

const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const back = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - back)
  return t.toISOString().slice(0, 10)
}

const scoredDays = (days: ScoredDay[]) =>
  days.filter((d): d is { date: string; score: number } => d.score != null).sort((a, b) => a.date.localeCompare(b.date))

export function weekMeans(days: ScoredDay[]): WeekMean[] {
  const by = new Map<string, number[]>()
  for (const d of scoredDays(days)) {
    const k = mondayOf(d.date)
    by.set(k, [...(by.get(k) ?? []), d.score])
  }
  return [...by.entries()]
    .map(([start, s]) => ({ start, mean: s.reduce((a, b) => a + b, 0) / s.length, days: s.length }))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function scoreProgress(days: ScoredDay[], today: string): ScoreProgress {
  const scored = scoredDays(days)
  // Today is still in progress: it can extend a streak but not break one.
  const finished = scored.filter((d, i) => !(d.date === today && d.score < STREAK_SCORE && i === scored.length - 1))
  let streak = 0
  for (let i = finished.length - 1; i >= 0 && finished[i].score >= STREAK_SCORE; i--) streak += 1
  let bestStreak = 0
  let run = 0
  for (const d of scored) {
    run = d.score >= STREAK_SCORE ? run + 1 : 0
    bestStreak = Math.max(bestStreak, run)
  }
  const weeks = weekMeans(scored)
  const thisStart = mondayOf(today)
  const thisWeek = weeks.find((w) => w.start === thisStart) ?? null
  const earlier = weeks.filter((w) => w.start < thisStart && w.days >= MIN_WEEK_DAYS)
  const bestWeek = earlier.reduce<WeekMean | null>((b, w) => (!b || w.mean > b.mean ? w : b), null)
  const newBestWeek = !!thisWeek && thisWeek.days >= MIN_WEEK_DAYS && !!bestWeek && round1(thisWeek.mean) > round1(bestWeek.mean)
  const bestDay = scored.reduce<{ date: string; score: number } | null>((b, d) => (!b || d.score > b.score ? d : b), null)
  return { streak, bestStreak, thisWeek, bestWeek, newBestWeek, bestDay }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Is `date`'s score above every earlier scored day (with enough history to mean something)? */
export function isBestDay(days: ScoredDay[], date: string): boolean {
  const scored = scoredDays(days)
  const day = scored.find((d) => d.date === date)
  if (!day) return false
  const before = scored.filter((d) => d.date < date)
  return before.length >= MIN_HISTORY_DAYS && day.score > Math.max(...before.map((d) => d.score)) && day.score >= STREAK_SCORE
}
