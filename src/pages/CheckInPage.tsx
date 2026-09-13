import { useState } from 'react'
import { AlertTriangle, Building2, Camera, MapPinCheck, X } from 'lucide-react'
import { useJourney } from '@/features/attendance/useJourney'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { SelfieCaptureSheet } from '@/features/attendance/SelfieCaptureSheet'
import { StartVisitSheet } from '@/features/visits/StartVisitSheet'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { greeting, formatDuration, formatTime } from '@/lib/datetime'
import { useProfile } from '@/features/auth/useProfile'

type PendingAction = 'clock-in' | 'clock-out' | null

export function CheckInPage() {
  const journey = useJourney()
  const { profile } = useProfile()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [showStartVisit, setShowStartVisit] = useState(false)

  const customerNames = useCustomerNames(journey.todaysVisits.map((v) => v.customer_id))

  const firstName = profile?.full_name?.split(' ')[0]

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

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-5 safe-top md:px-8">
        <p className="text-sm text-neutral-500">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
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

      <div className="mx-4 mt-4 rounded-xl2 bg-white p-5 shadow-card md:mx-8">
        <p className="text-3xl font-semibold tabular-nums text-neutral-900">
          {journey.openAttendance ? formatTime(journey.openAttendance.clock_in_at) : '--:--'}
        </p>
        <p
          className={`mt-1 text-sm font-semibold ${
            journey.attendance === 'CLOCKED_IN' ? 'text-status-working' : journey.attendance === 'CLOCKED_OUT' ? 'text-status-off' : 'text-neutral-400'
          }`}
        >
          {journey.attendance === 'CLOCKED_IN' && 'WORKING'}
          {journey.attendance === 'CLOCKED_OUT' && 'DAY COMPLETE'}
          {journey.attendance === 'NOT_CLOCKED_IN' && 'NOT CLOCKED IN'}
        </p>
        {journey.attendance === 'CLOCKED_IN' && journey.openAttendance && (
          <p className="mt-0.5 text-xs text-neutral-400">Clocked In since {formatTime(journey.openAttendance.clock_in_at)}</p>
        )}
      </div>

      <div className="mx-4 mt-4 rounded-xl2 bg-white p-5 shadow-card md:mx-8">
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
        <div className="mx-4 mt-4 rounded-xl2 bg-white p-5 shadow-card md:mx-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Journey</p>
          <JourneyTimeline attendance={journey.openAttendance} visits={journey.todaysVisits} customerNames={customerNames} />
        </div>
      )}

      <div className="mx-4 mt-6 md:mx-8">
        {journey.attendance === 'CLOCKED_IN' ? (
          <button
            onClick={() => setPendingAction('clock-out')}
            disabled={journey.busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-status-danger py-4 text-base font-semibold text-status-danger tap-target disabled:opacity-50"
          >
            <Camera className="h-4 w-4" /> CLOCK OUT
          </button>
        ) : journey.attendance === 'NOT_CLOCKED_IN' ? (
          <button
            onClick={() => setPendingAction('clock-in')}
            disabled={journey.busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white shadow-card tap-target disabled:opacity-60"
          >
            <Camera className="h-4 w-4" /> CLOCK IN
          </button>
        ) : (
          <p className="rounded-xl bg-neutral-100 py-4 text-center text-sm font-medium text-neutral-500">
            You've completed today's working session.
          </p>
        )}
      </div>

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
