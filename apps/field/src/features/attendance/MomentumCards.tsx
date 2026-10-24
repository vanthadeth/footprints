import { Flame, Trophy, Users } from 'lucide-react'
import { BAND_LABEL, formatScore, scoreBand, scoreTextClass } from './effectivenessScore'
import { STREAK_SCORE, type ScoreProgress } from './scoreProgress'
import { PRIORITY_PURCHASE_DAYS, PRIORITY_VISIT_DAYS } from '@footprints/shared/lib/config'
import type { PriorityCoverage } from '@/features/customers/priorityCoverage'

const card = 'space-y-2.5 rounded-2xl bg-white p-4 shadow-card'
const weekLabel = (start: string) => new Date(`${start}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Streak at Good or better, this week against the best week so far. */
export function MomentumCard({ progress }: { progress: ScoreProgress }) {
  const { streak, bestStreak, thisWeek, bestWeek, newBestWeek } = progress
  return (
    <section className={card} aria-label="Momentum">
      <span className="flex items-center gap-1.5 text-xs font-bold text-status-warn">
        <Flame className="h-4 w-4" aria-hidden />
        Momentum
      </span>
      <p className="text-base font-bold leading-snug text-neutral-900">
        {streak > 0 ? `${streak}-day streak at ${BAND_LABEL.good} or better` : `No streak yet: a day of ${STREAK_SCORE}+ starts one`}
      </p>
      {bestStreak > streak && <p className="text-xs text-neutral-500">Your longest: {bestStreak} days.</p>}
      {thisWeek && (
        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-2.5 text-[13px]">
          <span className="font-semibold text-neutral-600">This week</span>
          <span className="flex items-baseline gap-2">
            <b className={`text-lg font-extrabold ${scoreTextClass(thisWeek.mean)}`}>{formatScore(thisWeek.mean)}</b>
            <span className="text-xs text-neutral-500">{BAND_LABEL[scoreBand(thisWeek.mean)]}</span>
          </span>
        </div>
      )}
      {newBestWeek ? (
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-status-working">
          <Trophy className="h-4 w-4" aria-hidden />
          Your best week yet
        </p>
      ) : (
        bestWeek && (
          <p className="text-xs text-neutral-500">
            Best week: {formatScore(bestWeek.mean)} (week of {weekLabel(bestWeek.start)}).
          </p>
        )
      )}
    </section>
  )
}

/** Own customers who bought recently, how many were visited within the cycle, and who is overdue. */
export function PriorityCard({ coverage }: { coverage: PriorityCoverage }) {
  const { total, seen, overdue } = coverage
  const shown = overdue.slice(0, 5)
  return (
    <section className={card} aria-label="Priority customers">
      <span className="flex items-center gap-1.5 text-xs font-bold text-status-visiting">
        <Users className="h-4 w-4" aria-hidden />
        Priority customers
      </span>
      <p className="text-base font-bold leading-snug text-neutral-900">
        {seen} of {total} seen in {PRIORITY_VISIT_DAYS} days
        {overdue.length > 0 && <span className="text-status-warn"> · {overdue.length} overdue</span>}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100" role="presentation">
        <div className="h-full rounded-full bg-status-visiting" style={{ width: `${total ? (seen / total) * 100 : 0}%` }} />
      </div>
      {shown.length > 0 ? (
        <ul className="divide-y divide-neutral-100 text-[13px]">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate font-semibold text-neutral-900">{c.name}</span>
              <span className="shrink-0 text-xs font-bold text-status-warn">{c.daysSince == null ? 'Never visited' : `${c.daysSince} days ago`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs font-semibold text-status-working">Everyone who bought recently has been seen.</p>
      )}
      {overdue.length > shown.length && <p className="text-xs text-neutral-500">and {overdue.length - shown.length} more</p>}
      <p className="text-[11px] text-neutral-500">Your customers who bought in the last {PRIORITY_PURCHASE_DAYS} days.</p>
    </section>
  )
}
