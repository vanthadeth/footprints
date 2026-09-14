import { useState } from 'react'
import { AlertTriangle, Camera, Footprints as FootprintsIcon, MapPin, X } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { SelfieCaptureSheet } from '@/features/attendance/SelfieCaptureSheet'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { VisitFlow } from '@/features/visits/VisitFlow'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useAppSettings } from '@/hooks/useAppSettings'
import { greeting, formatDuration, formatTime, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '@/lib/datetime'
import { useProfile } from '@/features/auth/useProfile'

type PendingAction = 'clock-in' | 'clock-out' | null

export function CheckInPage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const settings = useAppSettings()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [flowOpen, setFlowOpen] = useState(false)

  const autoCheckoutCustomerId = journey.lastAutoCheckout?.visit.customer_id ?? null
  const customerNames = useCustomerNames([autoCheckoutCustomerId])

  const firstName = profile?.full_name?.split(' ')[0]

  async function handleSelfie(blob: Blob) {
    if (pendingAction === 'clock-in') await journey.clockIn(blob)
    if (pendingAction === 'clock-out') await journey.clockOut(blob)
    setPendingAction(null)
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

  const isDayComplete = journey.attendance === 'CLOCKED_OUT'
  const isVisiting = journey.visit === 'VISITING'

  // The RPC is the real gate (app.within_clock_in_window()) -- this only
  // disables the button and explains why, so nobody wastes a selfie capture
  // on a clock-in the server was always going to reject.
  const canClockIn = isWithinClockInWindow(settings.workStartTime, settings.workEndTime, settings.allowEarlyClockinMinutes)
  const clockInWindowClosed = !canClockIn && isPastTimeOfDay(settings.workEndTime)
  const clockInOpensAt = shiftTimeOfDay(settings.workStartTime, -settings.allowEarlyClockinMinutes)

  const today: DayJourney = { date: '', attendance: journey.openAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0

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
            {canClockIn && "Your day hasn't started yet. Clock in to begin tracking your visits."}
            {!canClockIn && !clockInWindowClosed && `Clock-in opens at ${clockInOpensAt}.`}
            {clockInWindowClosed && `Clock-in is closed for today -- working hours ended at ${shiftTimeOfDay(settings.workEndTime, 0)}.`}
          </p>
          <button
            onClick={() => setPendingAction('clock-in')}
            disabled={journey.busy || !canClockIn}
            className="mt-7 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white tap-target disabled:opacity-40"
          >
            <Camera className="h-4.5 w-4.5" /> CLOCK IN
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
                <p className="mt-1 text-xl font-semibold text-white">
                  {journey.openAttendance ? formatTime(journey.openAttendance.clock_in_at) : '--:--'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Clock Out</p>
                <p className="mt-1 text-xl font-semibold text-white">
                  {journey.openAttendance?.clock_out_at ? formatTime(journey.openAttendance.clock_out_at) : '--:--'}
                </p>
              </div>
            </div>

            {isDayComplete ? (
              <div className="relative mt-5 rounded-xl bg-white/10 py-3.5 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-white/50">Total Working Hours</p>
                <p className="mt-0.5 text-lg font-semibold text-white">{formatDuration(stats.totalWorkingMs)}</p>
              </div>
            ) : (
              <button
                onClick={() => setPendingAction('clock-out')}
                disabled={journey.busy}
                className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
              >
                <Camera className="h-4 w-4" /> CLOCK OUT
              </button>
            )}
          </div>

          {/* Sub section: the day's shape at a glance. */}
          <div className="mt-3 grid grid-cols-4 divide-x divide-neutral-100 rounded-xl2 bg-white p-4 text-center shadow-card dark:divide-neutral-700">
            <Stat label="Visits" value={String(stats.totalVisits)} />
            <Stat label="Active" value={formatDuration(stats.totalVisitingMs)} />
            <Stat label="Gap" value={formatDuration(stats.totalGapMs)} />
            <Stat label="Effectiveness" value={`${effectivenessRatio}%`} />
          </div>

          <button
            onClick={() => setFlowOpen(true)}
            disabled={isDayComplete || journey.busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white tap-target disabled:opacity-40"
          >
            <MapPin className="h-4.5 w-4.5" /> {isVisiting ? 'CONTINUE VISIT' : 'CHECK IN'}
          </button>
          {isDayComplete && <p className="mt-2 text-center text-xs text-neutral-400">Your day is complete -- check in is no longer available.</p>}
        </div>
      )}

      <SelfieCaptureSheet
        open={pendingAction !== null}
        title={pendingAction === 'clock-in' ? 'Clock In Selfie' : 'Clock Out Selfie'}
        onCancel={() => setPendingAction(null)}
        onCapture={handleSelfie}
      />

      <VisitFlow open={flowOpen} onClose={() => setFlowOpen(false)} />
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
