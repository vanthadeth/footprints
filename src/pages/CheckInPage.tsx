import { useState } from 'react'
import { AlertTriangle, Building2, Camera, ChevronRight, Footprints as FootprintsIcon, Loader2, MapPin, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import type { VisitRow } from '@/features/attendance/types'
import { SelfieCaptureSheet } from '@/features/attendance/SelfieCaptureSheet'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { VisitFlow } from '@/features/visits/VisitFlow'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useAppSettings } from '@/hooks/useAppSettings'
import { summarizeAttendanceTimes } from '@/features/attendance/stateMachine'
import { locationService } from '@/features/location/locationService'
import { greeting, formatDuration, formatTime, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '@/lib/datetime'
import { useProfile } from '@/features/auth/useProfile'

type PendingAction = 'clock-in' | 'clock-out' | null

export function CheckInPage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const settings = useAppSettings()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [checkingLocation, setCheckingLocation] = useState(false)
  const [lowAccuracyM, setLowAccuracyM] = useState<number | null>(null)

  const autoCheckoutCustomerId = journey.lastAutoCheckout?.visit.customer_id ?? null
  // Most recent completed visits today, newest first -- shown under the
  // Check In button so you can see what you've already covered before
  // starting another one.
  const recentVisits = [...journey.todaysVisits]
    .filter((v) => v.checked_out_at && !v.cancelled_at)
    .sort((a, b) => b.checked_out_at!.localeCompare(a.checked_out_at!))
    .slice(0, 5)
  const customerNames = useCustomerNames([autoCheckoutCustomerId, journey.openVisit?.customer_id ?? null, ...recentVisits.map((v) => v.customer_id)])

  const firstName = profile?.full_name?.split(' ')[0]

  async function handleSelfie(blob: Blob) {
    if (pendingAction === 'clock-in') await journey.clockIn(blob)
    if (pendingAction === 'clock-out') await journey.clockOut(blob)
    setPendingAction(null)
  }

  // Check the GPS fix *before* asking for a selfie -- a bad reading rejects
  // at the server anyway (app.clock_in), but catching it here means nobody
  // wastes a selfie capture on a clock-in that was always going to fail.
  async function handleClockInTap() {
    setCheckingLocation(true)
    try {
      const reading = await locationService.getCurrentPosition()
      if (reading.accuracy > settings.maxLocationAccuracyM) {
        setLowAccuracyM(reading.accuracy)
        return
      }
      setPendingAction('clock-in')
    } catch {
      // Couldn't get a reading at all -- let the normal clock-in flow surface
      // that (it re-fetches location and reports "location required" itself)
      // rather than duplicating that error message here.
      setPendingAction('clock-in')
    } finally {
      setCheckingLocation(false)
    }
  }

  if (journey.loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 md:max-w-2xl">
        <div className="h-8 w-40 animate-pulse rounded bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-xl2 bg-neutral-100" />
        <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
      </div>
    )
  }

  const isVisiting = journey.visit === 'VISITING'

  // The RPC is the real gate (app.within_clock_in_window()) -- this only
  // disables the button and explains why, so nobody wastes a selfie capture
  // on a clock-in the server was always going to reject.
  const canClockIn = isWithinClockInWindow(settings.workStartTime, settings.workEndTime, settings.allowEarlyClockinMinutes)
  const clockInWindowClosed = !canClockIn && isPastTimeOfDay(settings.workEndTime)
  const clockInOpensAt = shiftTimeOfDay(settings.workStartTime, -settings.allowEarlyClockinMinutes)

  // Multiple clock-in/clock-out sessions are allowed in one day (a lunch
  // break, a split shift) -- stats and the hero times below are summed
  // across every session today, not just whichever one is currently open.
  const today: DayJourney = { date: '', attendance: journey.todaysAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0
  const { clockInTime, clockOutTime } = summarizeAttendanceTimes(journey.todaysAttendance, journey.openAttendance)

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      {journey.error && (
        <div role="alert" className="mx-4 mt-4 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger md:mx-8">
          {journey.error}
        </div>
      )}

      {journey.lastAutoClockOut && (
        <AutoClockOutBanner clockOutAt={journey.lastAutoClockOut.clock_out_at} onDismiss={journey.clearAutoClockOutNotice} />
      )}

      {journey.lastAutoCheckout && (
        <AutoCheckoutBanner
          reason={journey.lastAutoCheckout.reason}
          customerName={autoCheckoutCustomerId ? customerNames[autoCheckoutCustomerId] : null}
          distance={journey.lastAutoCheckout.visit.checkout_distance_m}
          onDismiss={journey.clearAutoCheckoutNotice}
        />
      )}

      {journey.attendance === 'NOT_CLOCKED_IN' ? (
        /* Not yet clocked in: nothing to compete for attention -- one
           message, one action, centered in the screen's focus area. */
        <div className="flex min-h-[calc(100dvh-11rem)] flex-col items-center justify-center px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <FootprintsIcon className="h-9 w-9" />
          </div>
          <p className="mt-5 text-lg font-semibold text-neutral-900">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </p>
          <p className="mt-1.5 max-w-xs text-sm text-neutral-500">
            {canClockIn &&
              journey.todaysAttendance.length === 0 &&
              "Your day hasn't started yet. Clock in to begin tracking your visits."}
            {canClockIn &&
              journey.todaysAttendance.length > 0 &&
              `You've clocked in ${journey.todaysAttendance.length} time${journey.todaysAttendance.length > 1 ? 's' : ''} today (${formatDuration(stats.totalWorkingMs)} so far). Clock in again to start a new session.`}
            {!canClockIn && !clockInWindowClosed && `Clock-in opens at ${clockInOpensAt}.`}
            {clockInWindowClosed && `Clock-in is closed for today -- working hours ended at ${shiftTimeOfDay(settings.workEndTime, 0)}.`}
          </p>
          <button
            onClick={handleClockInTap}
            disabled={journey.busy || !canClockIn || checkingLocation}
            className="mt-7 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white tap-target disabled:opacity-40"
          >
            {checkingLocation ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Camera className="h-4.5 w-4.5" />}
            {checkingLocation ? 'Checking Location…' : 'CLOCK IN'}
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4 md:px-8">
          {/* Main section: today's attendance -- in/out times, and the total once both are set. */}
          <div className="relative overflow-hidden rounded-xl2 bg-brand-900 p-5 shadow-card">
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/5" />

            <div className="relative flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Clock In</p>
                <p className="mt-1 text-xl font-semibold text-white">{clockInTime ? formatTime(clockInTime) : '--:--'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Clock Out</p>
                <p className="mt-1 text-xl font-semibold text-white">{clockOutTime ? formatTime(clockOutTime) : '--:--'}</p>
              </div>
            </div>

            <button
              onClick={() => setPendingAction('clock-out')}
              disabled={journey.busy}
              className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
            >
              <Camera className="h-4 w-4" /> CLOCK OUT
            </button>
            {/* app.clock_out force-checks-out a still-open visit rather than
                blocking the clock-out -- flagged AUTO_CHECKOUT_CLOCK_OUT so
                it's distinguishable from a radius-triggered auto checkout. */}
            {isVisiting ? (
              <p className="relative mt-2 text-center text-xs text-white/40">This will also check you out of your current visit.</p>
            ) : (
              journey.todaysAttendance.length > 1 && (
                <p className="relative mt-2 text-center text-xs text-white/40">{journey.todaysAttendance.length} sessions today</p>
              )
            )}
          </div>

          {/* Sub section: the day's shape at a glance. */}
          <div className="mt-3 grid grid-cols-4 divide-x divide-neutral-100 rounded-xl2 bg-white p-4 text-center shadow-card dark:divide-neutral-700">
            <Stat label="Visits" value={String(stats.totalVisits)} />
            <Stat label="Active" value={formatDuration(stats.totalVisitingMs)} />
            <Stat label="Gap" value={formatDuration(stats.totalGapMs)} />
            <Stat label="Effectiveness" value={`${effectivenessRatio}%`} />
          </div>

          {/* Only one visit can ever be open at a time (app.check_in enforces
              this server-side) -- so once checked in, there's nothing left
              to "check in" to. Show what you're already checked into instead
              of a button that would just fail. */}
          {isVisiting && journey.openVisit ? (
            <CurrentVisitCard
              visit={journey.openVisit}
              customerName={journey.openVisit.customer_id ? customerNames[journey.openVisit.customer_id] : undefined}
              onView={() => setFlowOpen(true)}
            />
          ) : (
            <button
              onClick={() => setFlowOpen(true)}
              disabled={journey.busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white tap-target disabled:opacity-40"
            >
              <MapPin className="h-4.5 w-4.5" /> CHECK IN
            </button>
          )}

          {!isVisiting && recentVisits.length > 0 && <RecentVisits visits={recentVisits} customerNames={customerNames} />}
        </div>
      )}

      <SelfieCaptureSheet
        open={pendingAction !== null}
        title={pendingAction === 'clock-in' ? 'Clock In Selfie' : 'Clock Out Selfie'}
        onCancel={() => setPendingAction(null)}
        onCapture={handleSelfie}
      />

      <VisitFlow open={flowOpen} onClose={() => setFlowOpen(false)} />

      <BottomSheet open={lowAccuracyM !== null} onClose={() => setLowAccuracyM(null)} title="Location Accuracy Too Low">
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            Your location accuracy is currently {lowAccuracyM != null ? `${Math.round(lowAccuracyM)} m` : 'too low'} -- {settings.maxLocationAccuracyM} m
            or better is required to clock in. Move to an open area, away from buildings or indoors, and try again.
          </p>
          <button
            onClick={() => {
              setLowAccuracyM(null)
              void handleClockInTap()
            }}
            disabled={checkingLocation}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
          >
            {checkingLocation && <Loader2 className="h-4 w-4 animate-spin" />}
            {checkingLocation ? 'Checking Location…' : 'Try Again'}
          </button>
          <button onClick={() => setLowAccuracyM(null)} className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target">
            Cancel
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1">
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  )
}

function CurrentVisitCard({
  visit,
  customerName,
  onView,
}: {
  visit: VisitRow
  customerName: string | undefined
  onView: () => void
}) {
  const label = visit.customer_id ? customerName ?? 'Loading…' : 'Unassigned Visit'
  return (
    <button
      onClick={onView}
      className="mt-3 flex w-full items-center gap-3 rounded-xl2 border border-brand-200 bg-brand-50 p-4 text-left tap-target"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
        <MapPin className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-status-visiting" /> Currently Checked In
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500">
          Since {formatTime(visit.checked_in_at)} · {formatDuration(Date.now() - new Date(visit.checked_in_at).getTime())} so far
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-brand-400" />
    </button>
  )
}

function RecentVisits({ visits, customerNames }: { visits: VisitRow[]; customerNames: Record<string, string> }) {
  return (
    <div className="mt-4">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Recent Visits</p>
      <div className="space-y-2">
        {visits.map((v) => {
          const duration = formatDuration(new Date(v.checked_out_at!).getTime() - new Date(v.checked_in_at).getTime())
          const flagged = (v.flags?.length ?? 0) > 0 || v.out_of_range
          return (
            <div key={v.id} className="flex items-center gap-3 rounded-xl2 bg-white p-3.5 shadow-card">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {v.customer_id ? customerNames[v.customer_id] ?? 'Loading…' : 'Unassigned Visit'}
                </p>
                <p className="text-xs text-neutral-400">{duration}</p>
              </div>
              {flagged && (
                <span className="shrink-0 rounded-full bg-status-warn/10 px-2 py-0.5 text-[10px] font-medium text-status-warn">Flagged</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AutoClockOutBanner({ clockOutAt, onDismiss }: { clockOutAt: string | null; onDismiss: () => void }) {
  return (
    <div className="mx-4 mt-4 flex animate-slide-down items-start gap-3 rounded-xl bg-status-warn/10 p-4 md:mx-8">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warn" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-status-warn">Auto Clock Out</p>
        <p className="mt-0.5 text-neutral-700">
          You were clocked out automatically at {clockOutAt ? formatTime(clockOutAt) : 'end of day'} -- past working hours.
        </p>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-neutral-400 tap-target">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function AutoCheckoutBanner({
  reason,
  customerName,
  distance,
  onDismiss,
}: {
  reason: 'outside_radius' | 'clock_out'
  customerName: string | null | undefined
  distance: number | null
  onDismiss: () => void
}) {
  return (
    <div className="mx-4 mt-4 flex animate-slide-down items-start gap-3 rounded-xl bg-status-warn/10 p-4 md:mx-8">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warn" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-status-warn">Auto Check Out</p>
        <p className="mt-0.5 text-neutral-700">{customerName ?? 'Your visit'} was checked out automatically.</p>
        <p className="mt-1 text-xs text-neutral-500">
          Reason: {reason === 'outside_radius' ? 'Moved outside visit area' : 'Clocked out while visit was active'}
          {distance != null && ` · Distance: ${distance} m`}
        </p>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-neutral-400 tap-target">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
