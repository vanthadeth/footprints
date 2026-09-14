import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Loader2, MapPin, Navigation, Store, Users as UsersIcon } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useProfile } from '@/features/auth/useProfile'
import { useMyQuota } from '@/features/attendance/useMyQuota'
import { SelfieCaptureSheet } from '@/features/attendance/SelfieCaptureSheet'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { visitsService, type NearbyCustomer } from '@/features/visits/visitsService'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useAppSettings } from '@/hooks/useAppSettings'
import { locationService } from '@/features/location/locationService'
import { formatDistance } from '@/lib/geo'
import { formatDuration, formatLongDate, formatTime, greeting, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '@/lib/datetime'
import { BottomSheet } from '@/components/BottomSheet'

/**
 * The field-sales landing screen (spec's "My Day"): today's progress at a
 * glance, who to visit next, the shape of the day so far, and a fast path
 * into the app's other actions. Clocking in/out is folded in here too --
 * the field nav has no separate Check In tab, so this is the only place a
 * field-sales rep starts their day.
 */
export function HomePage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const settings = useAppSettings()
  const quota = useMyQuota(profile?.id ?? null)
  const navigate = useNavigate()

  const [pendingClockIn, setPendingClockIn] = useState(false)
  const [checkingLocation, setCheckingLocation] = useState(false)
  const [lowAccuracyM, setLowAccuracyM] = useState<number | null>(null)
  const [visitFlowOpen, setVisitFlowOpen] = useState(false)
  const [presetCustomer, setPresetCustomer] = useState<PresetCustomer | null>(null)

  const [nextCustomer, setNextCustomer] = useState<NearbyCustomer | null>(null)
  const [nextCustomerState, setNextCustomerState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const isClockedIn = journey.attendance === 'CLOCKED_IN'
  const isVisiting = journey.visit === 'VISITING'
  const firstName = profile?.full_name?.split(' ')[0]

  const today: DayJourney = { date: '', attendance: journey.todaysAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today])
  const effectivenessRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0

  const completedVisits = [...journey.todaysVisits]
    .filter((v) => v.checked_out_at && !v.cancelled_at)
    .sort((a, b) => a.checked_out_at!.localeCompare(b.checked_out_at!))

  const customerNames = useCustomerNames([
    journey.openVisit?.customer_id ?? null,
    nextCustomer?.id ?? null,
    ...completedVisits.map((v) => v.customer_id),
  ])

  // Suggest the nearest not-yet-visited customer once clocked in and free
  // (not mid-visit) -- there's no assigned daily route to follow (visiting
  // is proximity-driven throughout this app), so "next" means "closest".
  useEffect(() => {
    if (!isClockedIn || isVisiting) {
      setNextCustomer(null)
      setNextCustomerState('idle')
      return
    }
    let cancelled = false
    setNextCustomerState('loading')
    locationService
      .getCurrentPosition()
      .then((reading) => visitsService.nearbyCustomers(reading.latitude, reading.longitude, 1))
      .then((list) => {
        if (cancelled) return
        setNextCustomer(list[0] ?? null)
        setNextCustomerState('ready')
      })
      .catch(() => {
        if (!cancelled) setNextCustomerState('error')
      })
    return () => {
      cancelled = true
    }
  }, [isClockedIn, isVisiting])

  async function handleSelfie(blob: Blob) {
    await journey.clockIn(blob)
    setPendingClockIn(false)
  }

  async function handleClockInTap() {
    setCheckingLocation(true)
    try {
      const reading = await locationService.getCurrentPosition()
      if (reading.accuracy > settings.maxLocationAccuracyM) {
        setLowAccuracyM(reading.accuracy)
        return
      }
      setPendingClockIn(true)
    } catch {
      // Let the normal clock-in flow surface a location failure itself.
      setPendingClockIn(true)
    } finally {
      setCheckingLocation(false)
    }
  }

  function openCheckIn(customer: NearbyCustomer) {
    setPresetCustomer({ id: customer.id, shopName: customer.shop_name })
    setVisitFlowOpen(true)
  }

  function navigateToCustomer(customer: NearbyCustomer) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${customer.shop_name}`, '_blank', 'noopener')
  }

  if (journey.loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 md:max-w-2xl">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-100" />
        <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-xl2 bg-neutral-100" />
      </div>
    )
  }

  const canClockIn = isWithinClockInWindow(settings.workStartTime, settings.workEndTime, settings.allowEarlyClockinMinutes)
  const clockInWindowClosed = !canClockIn && isPastTimeOfDay(settings.workEndTime)
  const clockInOpensAt = shiftTimeOfDay(settings.workStartTime, -settings.allowEarlyClockinMinutes)

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <p className="text-lg font-semibold text-neutral-900">
          {greeting()}
          {firstName ? `, ${firstName}` : ''} 👋
        </p>
        <p className="text-sm text-neutral-500">{formatLongDate()}</p>

        {journey.error && (
          <div role="alert" className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {journey.error}
          </div>
        )}

        {!isClockedIn ? (
          <div className="mt-4 rounded-xl2 bg-brand-900 p-5 text-center shadow-card">
            <p className="text-sm font-medium text-white/70">
              {canClockIn && "Your day hasn't started yet. Clock in to begin tracking your visits."}
              {!canClockIn && !clockInWindowClosed && `Clock-in opens at ${clockInOpensAt}.`}
              {clockInWindowClosed && `Clock-in is closed for today -- working hours ended at ${shiftTimeOfDay(settings.workEndTime, 0)}.`}
            </p>
            <button
              onClick={handleClockInTap}
              disabled={journey.busy || !canClockIn || checkingLocation}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-semibold text-brand-700 tap-target disabled:opacity-40"
            >
              {checkingLocation ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Camera className="h-4.5 w-4.5" />}
              {checkingLocation ? 'Checking Location…' : 'CLOCK IN'}
            </button>
          </div>
        ) : (
          <>
            {/* Today's Progress */}
            <div className="mt-4 rounded-xl2 bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Progress</p>
              <div className="mt-2 flex items-baseline justify-between">
                <p className="text-2xl font-semibold text-neutral-900">
                  {stats.totalVisits}
                  {quota.dailyVisitTarget != null && <span className="text-base font-medium text-neutral-400"> / {quota.dailyVisitTarget}</span>}
                  <span className="ml-1.5 text-sm font-medium text-neutral-400">visits</span>
                </p>
                {quota.dailyVisitTarget != null && (
                  <p className="text-sm font-semibold text-brand-600">
                    {Math.min(100, Math.round((stats.totalVisits / quota.dailyVisitTarget) * 100))}%
                  </p>
                )}
              </div>
              {quota.dailyVisitTarget != null && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.min(100, Math.round((stats.totalVisits / quota.dailyVisitTarget) * 100))}%` }}
                  />
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{formatDuration(stats.totalVisitingMs)}</p>
                  <p className="text-xs text-neutral-400">Active Time</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{effectivenessRatio}%</p>
                  <p className="text-xs text-neutral-400">Effectiveness</p>
                </div>
              </div>
            </div>

            {/* Next Customer / Current Visit */}
            {isVisiting && journey.openVisit ? (
              <button
                onClick={() => setVisitFlowOpen(true)}
                className="mt-3 flex w-full items-center gap-3 rounded-xl2 border border-brand-200 bg-brand-50 p-4 text-left tap-target"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                  <MapPin className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-status-visiting" /> Currently Checked In
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-semibold text-neutral-900">
                    {journey.openVisit.customer_id ? (customerNames[journey.openVisit.customer_id] ?? 'Loading…') : 'Unassigned Visit'}
                  </span>
                  <span className="text-xs text-neutral-500">
                    Since {formatTime(journey.openVisit.checked_in_at)} ·{' '}
                    {formatDuration(Date.now() - new Date(journey.openVisit.checked_in_at).getTime())} so far
                  </span>
                </span>
              </button>
            ) : (
              <div className="mt-3 rounded-xl2 bg-white p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Next Customer</p>
                {nextCustomerState === 'loading' && <div className="mt-2 h-14 animate-pulse rounded-xl bg-neutral-100" />}
                {nextCustomerState === 'error' && <p className="mt-2 text-sm text-neutral-500">Couldn't get your location.</p>}
                {nextCustomerState === 'ready' && !nextCustomer && <p className="mt-2 text-sm text-neutral-500">No customers found nearby.</p>}
                {nextCustomer && (
                  <>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                        <Store className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-900">{nextCustomer.shop_name}</p>
                        <p className="flex items-center gap-1 text-xs text-neutral-500">
                          <MapPin className="h-3 w-3" /> {formatDistance(nextCustomer.distance_m)} away
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => openCheckIn(nextCustomer)}
                        disabled={journey.busy}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-40"
                      >
                        <MapPin className="h-4 w-4" /> CHECK IN
                      </button>
                      <button
                        onClick={() => navigateToCustomer(nextCustomer)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 tap-target"
                      >
                        <Navigation className="h-4 w-4" /> NAVIGATE
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Today's Route */}
            {completedVisits.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Route</p>
                <div className="space-y-2">
                  {completedVisits.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 rounded-xl2 bg-white p-3.5 shadow-card">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-working/10 text-status-working">
                        ✓
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {v.customer_id ? (customerNames[v.customer_id] ?? 'Loading…') : 'Unassigned Visit'}
                        </p>
                        <p className="text-xs text-neutral-400">{formatTime(v.checked_out_at)}</p>
                      </div>
                    </div>
                  ))}
                  {isVisiting && journey.openVisit && (
                    <div className="flex items-center gap-3 rounded-xl2 border border-brand-200 bg-brand-50 p-3.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        ●
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {journey.openVisit.customer_id ? (customerNames[journey.openVisit.customer_id] ?? 'Loading…') : 'Unassigned Visit'}
                        </p>
                        <p className="text-xs font-medium text-brand-600">NEXT</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="mt-4">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <QuickLink icon={UsersIcon} label="Customers" onClick={() => navigate('/customers')} />
                <QuickLink icon={MapPin} label="Visits" onClick={() => navigate('/visits')} />
              </div>
            </div>
          </>
        )}
      </div>

      <SelfieCaptureSheet open={pendingClockIn} title="Clock In Selfie" onCancel={() => setPendingClockIn(false)} onCapture={handleSelfie} />

      <VisitFlow
        open={visitFlowOpen}
        onClose={() => {
          setVisitFlowOpen(false)
          setPresetCustomer(null)
        }}
        presetCustomer={presetCustomer}
      />

      <BottomSheet open={lowAccuracyM !== null} onClose={() => setLowAccuracyM(null)} title="Location Accuracy Too Low">
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            Your location accuracy is currently {lowAccuracyM != null ? `${Math.round(lowAccuracyM)} m` : 'too low'} --{' '}
            {settings.maxLocationAccuracyM} m or better is required to clock in. Move to an open area, away from buildings or indoors, and try
            again.
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

function QuickLink({ icon: Icon, label, onClick }: { icon: typeof MapPin; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl2 bg-white p-3.5 text-left shadow-card tap-target"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="text-sm font-medium text-neutral-800">{label}</span>
    </button>
  )
}
