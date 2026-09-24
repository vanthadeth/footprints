import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Camera, CalendarDays } from 'lucide-react'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { attendanceService } from '@/features/attendance/attendanceService'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { JourneyHistoryReport } from '@/features/attendance/JourneyHistoryReport'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { DatePickerButton } from '@/features/attendance/DatePickerButton'
import { DayPickerBar } from '@/features/attendance/DayPickerBar'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { displayName } from '@/lib/displayName'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import { formatDuration, formatTime } from '@/lib/datetime'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { useTeamDayJourneys } from './useTeamDayJourneys'
import { useAppSettings } from '@/hooks/useAppSettings'
import { LATE_GRACE_MINUTES } from '@/lib/config'
import { FleetStatusBadge } from './FleetStatusBadge'
import type { FleetMemberSnapshot } from './types'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import type { LeaveType } from '@/features/leave/types'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid' }

const PhotoZoomViewer = lazy(() => import('@/components/PhotoZoomViewer').then((m) => ({ default: m.PhotoZoomViewer })))

const NO_DEPARTMENT = 'No Department'

/** Check In/Out report (spec): every team member's clock-in and clock-out for a chosen day, grouped by department, each with its selfie/time/preset location, its current live status, a link to its full footprint history, and a working-time summary. */
export function CheckInOutTab({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const [selectedDate, setSelectedDate] = useState(() => todayDateString())
  const range = useMemo(() => getCustomRange(selectedDate, selectedDate), [selectedDate])
  const team = useMemo(() => snapshots.map((s) => s.member), [snapshots])
  const userIds = useMemo(() => team.map((m) => m.id), [team])
  const { journeysByUserId, loading, error } = useTeamDayJourneys(userIds, range, selectedDate)
  const leaveByUserId = useApprovedLeaveOnDate(userIds, selectedDate)

  const locationIds = useMemo(
    () => Object.values(journeysByUserId).flatMap((day) => day.attendance.flatMap((a) => [a.clock_in_location_id, a.clock_out_location_id])),
    [journeysByUserId]
  )
  const locationNames = useLocationNames(locationIds)

  const { workStartTime } = useAppSettings()
  const summary = useMemo(() => {
    const days = Object.values(journeysByUserId)
    const firstIns = days.map((d) => d.attendance[0]?.clock_in_at).filter((t): t is string => !!t)
    return {
      clockedIn: firstIns.length,
      late: firstIns.filter((t) => minutesLate(formatTime(t), workStartTime) > LATE_GRACE_MINUTES).length,
      onLeave: userIds.filter((id) => leaveByUserId[id] && !journeysByUserId[id]).length,
      stillWorking: days.filter((d) => d.attendance.some((a) => !a.clock_out_at)).length,
    }
  }, [journeysByUserId, leaveByUserId, userIds, workStartTime])

  const groups = groupBy(snapshots, (s) => s.member.departmentName ?? NO_DEPARTMENT)
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

      <div className="mb-4 grid grid-cols-4 gap-2">
        <SummaryTile label="Clocked in" value={summary.clockedIn} tone="text-status-working dark:text-emerald-300" />
        <SummaryTile label="Late" value={summary.late} tone="text-status-danger" />
        <SummaryTile label="On leave" value={summary.onLeave} tone="text-brand-600" />
        <SummaryTile label="Still working" value={summary.stillWorking} tone="text-neutral-900" />
      </div>

      {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl2 bg-neutral-100" />
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No field salespeople yet.</p>
      ) : (
        <div className="space-y-4">
          {orderedKeys.map((key) => (
            <div key={key}>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{key}</p>
              <div className="space-y-3">
                {groups.get(key)!.map((snapshot) => (
                  <MemberCheckInOutCard
                    key={snapshot.member.id}
                    snapshot={snapshot}
                    day={journeysByUserId[snapshot.member.id] ?? null}
                    locationNames={locationNames}
                    leaveType={leaveByUserId[snapshot.member.id]}
                    workStartTime={workStartTime}
                  />
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
  snapshot,
  day,
  locationNames,
  leaveType,
  workStartTime,
}: {
  snapshot: FleetMemberSnapshot
  day: DayJourney | null
  locationNames: Record<string, string>
  leaveType: LeaveType | undefined
  workStartTime: string
}) {
  const { member, status } = snapshot
  const [footprintsOpen, setFootprintsOpen] = useState(false)
  const sessions = day?.attendance ?? []
  const firstSession = sessions[0] ?? null
  const lastSession = sessions[sessions.length - 1] ?? null
  const stats = computeJourneyStats(day ? [day] : [])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0
  // Only overrides the placeholder when there's no attendance at all that
  // day -- an actual clock-in/out session is ground truth and always wins.
  const onLeaveLabel = !day && leaveType ? `On ${LEAVE_TYPE_LABEL[leaveType]} Leave` : null
  const lateMinutes = firstSession ? minutesLate(formatTime(firstSession.clock_in_at), workStartTime) : 0
  const isLate = lateMinutes > LATE_GRACE_MINUTES
  const initials = member.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-extrabold text-brand-700">{initials}</span>
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-neutral-900">{displayName(member.fullName, member.nickname)}</p>
        {isLate && (
          <span className="shrink-0 rounded-full bg-status-danger/10 px-2 py-0.5 text-[11px] font-bold text-status-danger">Late {lateMinutes}m</span>
        )}
        <FleetStatusBadge status={status} />
      </div>

      {onLeaveLabel && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-brand-50 px-3 py-2.5 text-brand-700">
          <CalendarDays className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="text-[13px] font-bold">{onLeaveLabel}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ClockPhotoColumn
          label="Check In"
          selfiePath={firstSession?.clock_in_selfie_path ?? null}
          time={firstSession?.clock_in_at ?? null}
          locationId={firstSession?.clock_in_location_id ?? null}
          locationNames={locationNames}
          emptyLabel={onLeaveLabel ?? 'Not clocked in'}
        />
        <ClockPhotoColumn
          label="Check Out"
          selfiePath={lastSession?.clock_out_at ? lastSession.clock_out_selfie_path : null}
          time={lastSession?.clock_out_at ?? null}
          locationId={lastSession?.clock_out_location_id ?? null}
          locationNames={locationNames}
          emptyLabel={onLeaveLabel ?? (lastSession && !lastSession.clock_out_at ? 'Still working' : 'Not clocked out')}
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

      <button
        onClick={() => setFootprintsOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-50 py-2.5 text-xs font-bold text-brand-700 tap-target"
      >
        <CalendarDays className="h-3.5 w-3.5 text-brand-500" /> View Footprints
      </button>

      <FullScreenSheet open={footprintsOpen} onClose={() => setFootprintsOpen(false)} label={`${displayName(member.fullName, member.nickname)} Footprints`}>
        <div className="h-full overflow-y-auto pt-16">
          <JourneyHistoryReport userId={member.id} interactive={false} subtitle={displayName(member.fullName, member.nickname)} />
        </div>
      </FullScreenSheet>
    </div>
  )
}

/** Minutes after the shift start ("HH:MM" strings), 0 when on time or early. */
function minutesLate(clockIn: string, workStart: string): number {
  const [h, m] = clockIn.split(':').map(Number)
  const [sh, sm] = workStart.split(':').map(Number)
  return Math.max(0, h * 60 + m - (sh * 60 + sm))
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white px-1 py-2.5 shadow-card">
      <span className={`text-xl font-extrabold ${tone}`}>{value}</span>
      <span className="text-center text-[10.5px] font-semibold leading-tight text-neutral-500">{label}</span>
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
    <div className="min-w-0">
      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <div className="flex items-start gap-2">
        {url ? (
          <button onClick={() => setZoomOpen(true)} className="block h-[68px] w-[51px] shrink-0 overflow-hidden rounded-lg bg-neutral-100 tap-target">
            <img src={url} alt={label} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-[68px] w-[51px] shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
            <Camera className="h-5 w-5" aria-hidden />
          </div>
        )}
        <div className="min-w-0 pt-0.5">
          {time ? (
            <>
              <p className="font-mono text-base font-extrabold text-neutral-900">{formatTime(time)}</p>
              <p className="text-[11.5px] leading-snug text-neutral-600">{locationLabel}</p>
            </>
          ) : (
            <p className="text-xs leading-snug text-neutral-500">{emptyLabel}</p>
          )}
        </div>
      </div>

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
