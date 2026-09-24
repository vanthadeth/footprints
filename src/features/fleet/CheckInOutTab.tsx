import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Camera } from 'lucide-react'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { attendanceService } from '@/features/attendance/attendanceService'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { DatePickerButton } from '@/features/attendance/DatePickerButton'
import { DayPickerBar } from '@/features/attendance/DayPickerBar'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { displayName } from '@/lib/displayName'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import { formatDuration, formatTime } from '@/lib/datetime'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { useTeamDayJourneys } from './useTeamDayJourneys'
import type { TeamMember } from './types'

const PhotoZoomViewer = lazy(() => import('@/components/PhotoZoomViewer').then((m) => ({ default: m.PhotoZoomViewer })))

const NO_DEPARTMENT = 'No Department'

/** Check In/Out report (spec): every team member's clock-in and clock-out for a chosen day, grouped by department, each with its selfie/time/preset location and a working-time summary. */
export function CheckInOutTab({ team }: { team: TeamMember[] }) {
  const [selectedDate, setSelectedDate] = useState(() => todayDateString())
  const range = useMemo(() => getCustomRange(selectedDate, selectedDate), [selectedDate])
  const userIds = useMemo(() => team.map((m) => m.id), [team])
  const { journeysByUserId, loading, error } = useTeamDayJourneys(userIds, range, selectedDate)

  const locationIds = useMemo(
    () => Object.values(journeysByUserId).flatMap((day) => day.attendance.flatMap((a) => [a.clock_in_location_id, a.clock_out_location_id])),
    [journeysByUserId]
  )
  const locationNames = useLocationNames(locationIds)

  const groups = groupBy(team, (m) => m.departmentName ?? NO_DEPARTMENT)
  const orderedKeys = sortGroupKeys(groups.keys(), NO_DEPARTMENT)

  return (
    <div>
      <div className="mb-4 rounded-xl2 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-neutral-900">{formatDayLabel(selectedDate)}</p>
          <DatePickerButton selected={selectedDate} onChange={setSelectedDate} />
        </div>
        <div className="mt-3">
          <DayPickerBar selected={selectedDate} onChange={setSelectedDate} />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl2 bg-neutral-100" />
          ))}
        </div>
      ) : team.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No field salespeople yet.</p>
      ) : (
        <div className="space-y-4">
          {orderedKeys.map((key) => (
            <div key={key}>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{key}</p>
              <div className="space-y-3">
                {groups.get(key)!.map((member) => (
                  <MemberCheckInOutCard key={member.id} member={member} day={journeysByUserId[member.id] ?? null} locationNames={locationNames} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDayLabel(date: string): string {
  if (date === todayDateString()) return 'Today'
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function MemberCheckInOutCard({
  member,
  day,
  locationNames,
}: {
  member: TeamMember
  day: DayJourney | null
  locationNames: Record<string, string>
}) {
  const sessions = day?.attendance ?? []
  const firstSession = sessions[0] ?? null
  const lastSession = sessions[sessions.length - 1] ?? null
  const stats = computeJourneyStats(day ? [day] : [])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0

  return (
    <div className="rounded-xl2 bg-white p-4 shadow-card">
      <p className="mb-3 text-sm font-semibold text-neutral-900">{displayName(member.fullName, member.nickname)}</p>

      <div className="grid grid-cols-2 gap-3">
        <ClockPhotoColumn
          label="Check In"
          selfiePath={firstSession?.clock_in_selfie_path ?? null}
          time={firstSession?.clock_in_at ?? null}
          locationId={firstSession?.clock_in_location_id ?? null}
          locationNames={locationNames}
          emptyLabel="Not clocked in"
        />
        <ClockPhotoColumn
          label="Check Out"
          selfiePath={lastSession?.clock_out_at ? lastSession.clock_out_selfie_path : null}
          time={lastSession?.clock_out_at ?? null}
          locationId={lastSession?.clock_out_location_id ?? null}
          locationNames={locationNames}
          emptyLabel={lastSession && !lastSession.clock_out_at ? 'Still working' : 'Not clocked out'}
        />
      </div>

      {day && (
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-neutral-100 pt-3">
          <SummaryStat label="Working" value={formatDuration(stats.totalWorkingMs)} />
          <SummaryStat label="Active" value={formatDuration(stats.totalVisitingMs)} />
          <SummaryStat label="Idle" value={formatDuration(stats.totalGapMs)} />
          <SummaryStat label="Effective" value={`${effectivenessRatio}%`} />
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="truncate text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  )
}

function ClockPhotoColumn({
  label,
  selfiePath,
  time,
  locationId,
  locationNames,
  emptyLabel,
}: {
  label: string
  selfiePath: string | null
  time: string | null
  locationId: string | null
  locationNames: Record<string, string>
  emptyLabel: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)

  useEffect(() => {
    setUrl(null)
    if (!selfiePath) return
    let cancelled = false
    attendanceService.getSelfieUrl(selfiePath).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl)
    })
    return () => {
      cancelled = true
    }
  }, [selfiePath])

  const locationLabel = locationId ? locationNames[locationId] ?? 'Loading…' : 'No preset location'

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      {url ? (
        <button onClick={() => setZoomOpen(true)} className="block aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100 tap-target">
          <img src={url} alt={label} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
          <Camera className="h-6 w-6" />
        </div>
      )}
      {time ? (
        <>
          <p className="mt-1.5 text-sm font-medium text-neutral-900">{formatTime(time)}</p>
          <p className="truncate text-xs text-neutral-500">{locationLabel}</p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-400">{emptyLabel}</p>
      )}

      <FullScreenSheet open={zoomOpen} onClose={() => setZoomOpen(false)} label={label}>
        {url && (
          <div className="h-full w-full bg-black">
            <Suspense fallback={null}>
              <PhotoZoomViewer src={url} alt={label} />
            </Suspense>
          </div>
        )}
      </FullScreenSheet>
    </div>
  )
}
