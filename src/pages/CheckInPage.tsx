import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, Camera, ChevronRight, Footprints as FootprintsIcon, MapPinCheck, X } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { SelfieCaptureSheet } from '@/features/attendance/SelfieCaptureSheet'
import { StartVisitSheet } from '@/features/visits/StartVisitSheet'
import { ProgressRing } from '@/components/ProgressRing'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { greeting, formatDuration, formatTime } from '@/lib/datetime'
import { useProfile } from '@/features/auth/useProfile'

type PendingAction = 'clock-in' | 'clock-out' | null

export function CheckInPage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [showStartVisit, setShowStartVisit] = useState(false)

  const customerNames = useCustomerNames(journey.todaysVisits.map((v) => v.customer_id))

  const firstName = profile?.full_name?.split(' ')[0]
  const initial = profile?.full_name?.trim()?.[0]?.toUpperCase() ?? '·'

  async function handleSelfie(blob: Blob) {
    if (pendingAction === 'clock-in') await journey.clockIn(blob)
    if (pendingAction === 'clock-out') await journey.clockOut(blob)
    setPendingAction(null)
  }

  async function handleStartVisit(customerId: string | null) {
    setShowStartVisit(false)
    await journey.startVisit(customerId)
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

  const isClockedIn = journey.attendance === 'CLOCKED_IN'
  const isDayComplete = journey.attendance === 'CLOCKED_OUT'

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="flex items-center justify-between px-4 pt-5 safe-top md:px-8">
        <p className="text-sm text-neutral-500">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <Link
          to="/profile"
          aria-label="Profile"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 tap-target"
        >
          {initial}
        </Link>
      </div>

      {journey.error && (
        <div role="alert" className="mx-4 mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger md:mx-8">
          {journey.error}
        </div>
      )}

      {journey.lastAutoCheckout && (
        <AutoCheckoutBanner
          reason={journey.lastAutoCheckout.reason}
          customerName={
            journey.lastAutoCheckout.visit.customer_id ? customerNames[journey.lastAutoCheckout.visit.customer_id] : null
          }
          distance={journey.lastAutoCheckout.visit.checkout_distance_m}
          onDismiss={journey.clearAutoCheckoutNotice}
        />
      )}

      {/* Hero: today's attendance status, always the first thing you see and act on. */}
      <div className="relative mx-4 mt-4 overflow-hidden rounded-xl2 bg-brand-900 p-5 shadow-card md:mx-8">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/5" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Attendance</p>
            <p className="mt-1 truncate text-xl font-semibold text-white">
              {isClockedIn && 'Clocked In'}
              {isDayComplete && 'Day Complete'}
              {journey.attendance === 'NOT_CLOCKED_IN' && 'Not Clocked In'}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {isClockedIn && journey.openAttendance && `Since ${formatTime(journey.openAttendance.clock_in_at)}`}
              {isDayComplete && "You've completed today's session."}
              {journey.attendance === 'NOT_CLOCKED_IN' && 'Tap below to start your day.'}
            </p>
          </div>

          <ProgressRing
            value={isClockedIn ? 100 : isDayComplete ? 100 : 0}
            progressClassName={isDayComplete ? 'stroke-white/40' : 'stroke-earth-400'}
          >
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase text-white/40">Live</p>
              <p className="text-sm font-semibold text-white">
                {journey.openAttendance ? formatTime(journey.openAttendance.clock_in_at) : '--:--'}
              </p>
            </div>
          </ProgressRing>
        </div>

        {!isDayComplete && (
          <button
            onClick={() => setPendingAction(isClockedIn ? 'clock-out' : 'clock-in')}
            disabled={journey.busy}
            className={`relative mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold tap-target disabled:opacity-60 ${
              isClockedIn ? 'bg-white/10 text-white' : 'bg-earth-400 text-brand-900'
            }`}
          >
            <Camera className="h-4 w-4" /> {isClockedIn ? 'CLOCK OUT' : 'CLOCK IN'}
          </button>
        )}
      </div>

      {/* Quick-glance bento row: today's visit count and a shortcut into full history. */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3 md:mx-8">
        <div className="rounded-xl2 bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-neutral-500">Today's Visits</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900">{journey.todaysVisits.length}</p>
        </div>
        <Link to="/footprints" className="flex items-center justify-between rounded-xl2 bg-earth-50 p-4 shadow-card tap-target">
          <span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-earth-500">
              <FootprintsIcon className="h-3.5 w-3.5" /> Footprints
            </span>
            <span className="mt-1 block text-sm font-semibold text-neutral-900">Full journey</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-earth-500" />
        </Link>
      </div>

      <div className="mx-4 mt-3 rounded-xl2 bg-white p-5 shadow-card md:mx-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Current Visit</p>

        {journey.visit === 'VISITING' && journey.openVisit ? (
          <div className="mt-3">
            <p className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              <Building2 className="h-4 w-4 text-brand-500" />
              Visit #{journey.openVisit.visit_number ?? '—'}
              {!journey.openVisit.customer_id && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">Unassigned</span>
              )}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {journey.openVisit.customer_id ? customerNames[journey.openVisit.customer_id] ?? 'Loading…' : 'No customer selected'}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Started {formatTime(journey.openVisit.checked_in_at)} · {formatDuration(Date.now() - new Date(journey.openVisit.checked_in_at).getTime())}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-status-working">
              <MapPinCheck className="h-3.5 w-3.5" /> Location Verified
            </p>
            <button
              onClick={journey.endVisit}
              disabled={journey.busy}
              className="mt-4 w-full rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
            >
              {journey.busy ? 'Checking out…' : 'CHECK OUT'}
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-neutral-500">No Active Visit</p>
            <button
              onClick={() => setShowStartVisit(true)}
              disabled={journey.attendance !== 'CLOCKED_IN' || journey.busy}
              className="mt-4 w-full rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
            >
              START VISIT
            </button>
            {journey.attendance !== 'CLOCKED_IN' && (
              <p className="mt-2 text-center text-xs text-neutral-400">Clock in first to start a visit.</p>
            )}
          </div>
        )}
      </div>

      {journey.attendance !== 'NOT_CLOCKED_IN' && journey.openAttendance && (
        <div className="mx-4 mt-3 rounded-xl2 bg-white p-5 shadow-card md:mx-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Journey</p>
          <JourneyTimeline attendance={journey.openAttendance} visits={journey.todaysVisits} customerNames={customerNames} />
        </div>
      )}

      <SelfieCaptureSheet
        open={pendingAction !== null}
        title={pendingAction === 'clock-in' ? 'Clock In Selfie' : 'Clock Out Selfie'}
        onCancel={() => setPendingAction(null)}
        onCapture={handleSelfie}
      />

      <StartVisitSheet open={showStartVisit} onClose={() => setShowStartVisit(false)} onSelect={handleStartVisit} />
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
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl bg-status-warn/10 p-4 md:mx-8">
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
