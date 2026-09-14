import { useAuth } from '@/features/auth/AuthContext'
import { useMyQuota } from '@/features/attendance/useMyQuota'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { StatTile } from '@/components/StatTile'
import { getPresetRange } from '@/lib/dateRange'
import { formatDuration } from '@/lib/datetime'

/**
 * "This month" at a glance -- visit/attendance metrics only. Sales, Orders,
 * and Collections (in the spec's mockup) are left out honestly rather than
 * shown as $0: there's no order data anywhere in this app yet (see the
 * redesign plan) -- this screen picks it up once that ships.
 */
export function PerformancePage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const quota = useMyQuota(userId)
  const range = getPresetRange('this_month')
  const { days, loading, error } = useJourneyHistory(userId, range)

  const stats = computeJourneyStats(days)
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">This Month</p>

        {error && <p className="mt-2 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl2 bg-neutral-100" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatTile
                label="Visits"
                value={String(stats.totalVisits)}
                sub={quota.weeklyVisitTarget != null ? `Weekly target: ${quota.weeklyVisitTarget}` : undefined}
              />
              <StatTile label="Working Days" value={String(stats.workingDays)} />
              <StatTile label="Working Time" value={formatDuration(stats.totalWorkingMs)} />
              <StatTile label="Effectiveness" value={`${effectivenessRatio}%`} sub={`Avg visit ${formatDuration(stats.averageVisitMs)}`} />
            </div>

            <p className="mt-4 rounded-xl2 bg-neutral-100 p-3.5 text-center text-xs text-neutral-500">
              Sales, Orders, and Collections will appear here once order tracking ships.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
