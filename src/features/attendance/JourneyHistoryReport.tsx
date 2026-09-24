import { useState } from 'react'
import { Footprints as FootprintsIcon, Map } from 'lucide-react'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { EmptyState } from '@/components/EmptyState'
import { StatTile } from '@/components/StatTile'
import { FlagBadge } from '@/components/FlagBadge'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { JourneyMap } from '@/features/attendance/JourneyMap'
import { DayPickerBar } from '@/features/attendance/DayPickerBar'
import { DatePickerButton } from '@/features/attendance/DatePickerButton'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useLanguage } from '@/i18n/LanguageContext'
import { formatDuration } from '@/lib/datetime'
import { getCustomRange, todayDateString } from '@/lib/dateRange'

const LEAVE_TYPE_LABEL: Record<string, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid' }

/**
 * Day-by-day journey history for one user at a time: a 5-day picker, that
 * day's performance matrix, an on-demand journey map, and the full
 * timeline (spec §31-32). Used both for the signed-in user's own
 * Footprints page (`interactive`, editable records) and for a
 * manager/supervisor's read-only look at a subordinate's day from Fleet
 * (`!interactive` -- see JourneyTimeline's own `interactive` doc comment).
 */
export function JourneyHistoryReport({
  userId,
  interactive,
  subtitle,
}: {
  userId: string | null
  interactive: boolean
  subtitle?: string
}) {
  const { t, language } = useLanguage()
  const [selectedDate, setSelectedDate] = useState(() => todayDateString())
  const [mapOpen, setMapOpen] = useState(false)
  const range = getCustomRange(selectedDate, selectedDate)
  const { days, allVisits, loading, error, refresh } = useJourneyHistory(userId, range)
  const customerNames = useCustomerNames(allVisits.map((v) => v.customer_id))

  const day = days[0] ?? null
  const leaveType = useApprovedLeaveOnDate(userId ? [userId] : [], selectedDate)[userId ?? '']
  const stats = computeJourneyStats(day ? [day] : [])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0
  const flags = [...new Set((day?.visits ?? []).flatMap((v) => v.flags ?? []))]

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl">
      {/* Top section: 5-day picker (+ calendar, top-right, for any earlier date). */}
      <div className="mx-4 mt-4 rounded-xl2 bg-white p-5 shadow-card md:mx-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold text-neutral-900">{formatDayLabel(selectedDate, t)}</p>
            <p className="mt-0.5 text-sm text-neutral-400">{subtitle ?? t('footprints.subtitle')}</p>
          </div>
          <DatePickerButton selected={selectedDate} onChange={setSelectedDate} />
        </div>
        <div className="mt-4">
          <DayPickerBar selected={selectedDate} onChange={setSelectedDate} />
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
            {leaveType ? (
              <EmptyState icon={FootprintsIcon} title={t('footprints.onLeaveTitle', { type: LEAVE_TYPE_LABEL[leaveType] })} />
            ) : (
              <EmptyState icon={FootprintsIcon} title={t('footprints.emptyTitle')} body={t('footprints.emptyBody')} />
            )}
          </div>
        ) : (
          <>
            {/* Top section: performance matrix for the selected day. */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label={t('footprints.workingHours')} value={formatDuration(stats.totalWorkingMs, language)} />
              <StatTile
                label={t('nav.visits')}
                value={String(stats.totalVisits)}
                sub={stats.unassignedVisits ? t('footprints.unassignedSub', { n: String(stats.unassignedVisits) }) : undefined}
              />
              <StatTile
                label={t('footprints.activeHours')}
                value={formatDuration(stats.totalVisitingMs, language)}
                sub={t('footprints.avgPrefix', { duration: formatDuration(stats.averageVisitMs, language) })}
              />
              <StatTile
                label={t('home.effectiveness')}
                value={`${effectivenessRatio}%`}
                sub={t('footprints.gapPrefix', { duration: formatDuration(stats.totalGapMs, language) })}
              />
            </div>

            {flags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {flags.map((f) => (
                  <FlagBadge key={f} flag={f} />
                ))}
              </div>
            )}

            <button
              onClick={() => setMapOpen(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl2 border border-neutral-200 bg-white py-3 text-sm font-semibold text-neutral-700 shadow-card tap-target"
            >
              <Map className="h-4 w-4 text-brand-500" /> {t('footprints.viewJourneyMap')}
            </button>

            {/* Main section: the day's timeline, clock-in through clock-out. */}
            <div className="mt-4 rounded-xl2 bg-white p-4 shadow-card">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('footprints.timeline')}</p>
              <JourneyTimeline
                attendance={day.attendance}
                visits={day.visits}
                customerNames={customerNames}
                interactive={interactive}
                onVisitChanged={refresh}
              />
            </div>
          </>
        )}
      </div>

      <FullScreenSheet open={mapOpen} onClose={() => setMapOpen(false)} label={t('footprints.journeyMapLabel')}>
        {day && <JourneyMap visits={day.visits} attendance={day.attendance} customerNames={customerNames} height="100dvh" rounded={false} />}
      </FullScreenSheet>
    </div>
  )
}

function formatDayLabel(date: string, t: (key: string) => string): string {
  const today = todayDateString()
  if (date === today) return t('common.today')
  const [ty, tm, td] = today.split('-').map(Number)
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10)
  if (date === yesterday) return t('common.yesterday')
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
