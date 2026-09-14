import { useState } from 'react'
import { Footprints as FootprintsIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { StatTile } from '@/components/StatTile'
import { FlagBadge } from '@/components/FlagBadge'
import { useAuth } from '@/features/auth/AuthContext'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { JourneyMap } from '@/features/attendance/JourneyMap'
import { DayPickerBar } from '@/features/attendance/DayPickerBar'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { formatDuration } from '@/lib/datetime'
import { getCustomRange, todayDateString } from '@/lib/dateRange'

/** Personal journey history for one day at a time: a 7-day picker, that day's performance matrix, journey map, and full timeline (spec §31-32). */
export function FootprintsPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [selectedDate, setSelectedDate] = useState(() => todayDateString())
  const range = getCustomRange(selectedDate, selectedDate)
  const { days, allVisits, loading, error } = useJourneyHistory(userId, range)
  const customerNames = useCustomerNames(allVisits.map((v) => v.customer_id))

  const day = days[0] ?? null
  const stats = computeJourneyStats(day ? [day] : [])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0
  const flags = [...new Set((day?.visits ?? []).flatMap((v) => v.flags ?? []))]

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl">
      {/* Top section: 7-day picker (+ calendar for any earlier date). */}
      <div className="relative mx-4 mt-4 overflow-hidden rounded-xl2 bg-brand-900 p-5 shadow-card md:mx-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-xl font-semibold text-white">{formatDayLabel(selectedDate)}</p>
          <p className="mt-0.5 text-sm text-white/60">Your journey history</p>
          <div className="mt-4">
            <DayPickerBar selected={selectedDate} onChange={setSelectedDate} />
          </div>
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
        ) : !day ? (
          <div className="mt-4">
            <EmptyState icon={FootprintsIcon} title="No activity on this day" body="Clock in and start a visit to build your journey." />
          </div>
        ) : (
          <>
            {/* Top section: performance matrix for the selected day. */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Working Hours" value={formatDuration(stats.totalWorkingMs)} />
              <StatTile label="Visits" value={String(stats.totalVisits)} sub={stats.unassignedVisits ? `${stats.unassignedVisits} unassigned` : undefined} />
              <StatTile label="Active Hours" value={formatDuration(stats.totalVisitingMs)} sub={`Avg ${formatDuration(stats.averageVisitMs)}`} />
              <StatTile label="Effectiveness" value={`${effectivenessRatio}%`} sub={`Gap ${formatDuration(stats.totalGapMs)}`} />
            </div>

            {flags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {flags.map((f) => (
                  <FlagBadge key={f} flag={f} />
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl2 bg-white p-3 shadow-card">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Journey Map</p>
              <JourneyMap visits={day.visits} customerNames={customerNames} />
            </div>

            {/* Main section: the day's timeline, clock-in through clock-out. */}
            <div className="mt-4 rounded-xl2 bg-white p-4 shadow-card">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Timeline</p>
              <JourneyTimeline attendance={day.attendance} visits={day.visits} customerNames={customerNames} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatDayLabel(date: string): string {
  const today = todayDateString()
  if (date === today) return 'Today'
  const [ty, tm, td] = today.split('-').map(Number)
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10)
  if (date === yesterday) return 'Yesterday'
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
