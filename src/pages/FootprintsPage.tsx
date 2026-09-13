import { useState } from 'react'
import { Footprints as FootprintsIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { StatTile } from '@/components/StatTile'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { FlagBadge } from '@/components/FlagBadge'
import { useAuth } from '@/features/auth/AuthContext'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { JourneyMap } from '@/features/attendance/JourneyMap'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { formatDuration, formatTime } from '@/lib/datetime'
import { getPresetRange } from '@/lib/dateRange'

/** Personal journey history: today's/period attendance, visit stats, timeline, and journey map (spec §31-32). */
export function FootprintsPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [range, setRange] = useState(() => getPresetRange('today'))
  const { days, allVisits, loading, error } = useJourneyHistory(userId, range)
  const customerNames = useCustomerNames(allVisits.map((v) => v.customer_id))
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const stats = computeJourneyStats(days)

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl">
      <div className="relative mx-4 mt-5 overflow-hidden rounded-xl2 bg-brand-900 p-5 shadow-card safe-top md:mx-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">
              <FootprintsIcon className="h-3.5 w-3.5" /> Footprints
            </p>
            <p className="mt-1 text-xl font-semibold text-white">{range.label}</p>
            <p className="mt-0.5 text-sm text-white/60">Your journey history</p>
          </div>
          <DateRangeFilter value={range} onChange={setRange} tone="dark" />
        </div>
      </div>

      <div className="px-4 md:px-8">
        {error && <p className="mb-3 mt-4 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl2 bg-neutral-100" />
            ))}
          </div>
        ) : days.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={FootprintsIcon} title="No activity in this period" body="Clock in and start a visit to build your journey." />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Working Days" value={String(stats.workingDays)} />
              <StatTile label="Working Time" value={formatDuration(stats.totalWorkingMs)} />
              <StatTile label="Visits" value={String(stats.totalVisits)} sub={stats.unassignedVisits ? `${stats.unassignedVisits} unassigned` : undefined} />
              <StatTile label="Visit Time" value={formatDuration(stats.totalVisitingMs)} sub={`Avg ${formatDuration(stats.averageVisitMs)}`} />
            </div>

            <div className="mt-4 rounded-xl2 bg-white p-3 shadow-card">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Journey Map</p>
              <JourneyMap visits={allVisits} customerNames={customerNames} />
            </div>

            <div className="mt-4 space-y-3">
              {days.map((day) => {
                const isOpen = expandedDate === day.date
                const workedMs = day.attendance
                  ? new Date(day.attendance.clock_out_at ?? Date.now()).getTime() - new Date(day.attendance.clock_in_at).getTime()
                  : 0
                const flags = [...new Set(day.visits.flatMap((v) => v.flags ?? []))]

                return (
                  <div
                    key={day.date}
                    className={`overflow-hidden rounded-xl2 border-l-4 bg-white shadow-card ${
                      day.attendance ? 'border-brand-400' : 'border-neutral-200'
                    }`}
                  >
                    <button
                      onClick={() => setExpandedDate(isOpen ? null : day.date)}
                      className="flex w-full items-center justify-between px-4 py-3.5 text-left tap-target"
                    >
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {day.attendance ? `${formatTime(day.attendance.clock_in_at)} – ${formatTime(day.attendance.clock_out_at)}` : 'No clock-in'}
                          {day.attendance && ` · ${formatDuration(workedMs)}`} · {day.visits.length} visit{day.visits.length === 1 ? '' : 's'}
                        </p>
                        {flags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {flags.map((f) => (
                              <FlagBadge key={f} flag={f} />
                            ))}
                          </div>
                        )}
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-neutral-100 p-4">
                        <JourneyTimeline attendance={day.attendance} visits={day.visits} customerNames={customerNames} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
