import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, ChevronRight, Clock, Loader2, MapPin, X } from 'lucide-react'
import { ActivityRings } from '@/components/ActivityRings'
import { SlideToConfirm } from '@/components/SlideToConfirm'
import { useMyQuota } from '@/features/attendance/useMyQuota'
import { ACTIVE_TIME_GOAL_MINUTES, EFFECTIVENESS_GOAL } from '@/lib/config'
import { BottomSheet } from '@/components/BottomSheet'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import type { VisitRow } from '@/features/attendance/types'
import { SelfieCaptureSheet } from '@/features/attendance/SelfieCaptureSheet'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { VisitFlow } from '@/features/visits/VisitFlow'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { displayName } from '@/lib/displayName'
import { useAppSettings } from '@/hooks/useAppSettings'
import { summarizeAttendanceTimes } from '@/features/attendance/stateMachine'
import { locationService } from '@/features/location/locationService'
import { greeting, formatDuration, formatTime, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '@/lib/datetime'
import { useProfile } from '@/features/auth/useProfile'
import { useLanguage } from '@/i18n/LanguageContext'

type PendingAction = 'clock-in' | 'clock-out' | null

export function CheckInPage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const settings = useAppSettings()
  const quota = useMyQuota(profile?.id ?? null)
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
  // Computed above the loading guard below (hooks can't follow a
  // conditional return) -- summarizeAttendanceTimes handles an empty
  // todaysAttendance fine, returning all-null.
  const { clockInTime, clockOutTime, clockInLocationId, clockOutLocationId } = summarizeAttendanceTimes(
    journey.todaysAttendance,
    journey.openAttendance
  )
  const locationNames = useLocationNames([clockInLocationId, clockOutLocationId])

  const visitTarget = quota.dailyVisitTarget
  const firstName = profile ? displayName(profile.full_name, profile.nickname).split(' ')[0] : undefined

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
  const isClockedIn = journey.attendance !== 'NOT_CLOCKED_IN'

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

      <div className="space-y-3.5 px-4 pt-1 md:px-8 md:pt-4">
        <p className="text-[15px] font-semibold text-neutral-700">
          {greeting(undefined, language)}
          {firstName ? `, ${firstName}` : ''}
        </p>

        <div className="flex flex-wrap gap-2">
          {isClockedIn && clockInLocationId && locationNames[clockInLocationId] && (
            <span className="flex h-[30px] items-center gap-2 rounded-full border border-neutral-200 bg-white pl-2.5 pr-3 text-xs font-semibold text-neutral-600">
              <span className="h-2 w-2 rounded-full bg-status-working shadow-[0_0_0_3px_rgba(15,110,79,0.2)]" />
              {locationNames[clockInLocationId]}
            </span>
          )}
          <span className="flex h-[30px] items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {t('checkIn.shift', { start: settings.workStartTime, end: settings.workEndTime })}
          </span>
        </div>

        {/* Status hero: off shift shows the clock and when you can start; on shift shows time worked. */}
        <div className="relative overflow-hidden rounded-[20px] bg-brand-900 p-5 text-white shadow-card">
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-2 -top-2 h-28 w-28 rounded-full border border-white/10" />
          <div className="relative flex items-center justify-between">
            <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isClockedIn ? 'text-emerald-300' : 'text-brand-100'}`}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {isClockedIn ? t('checkIn.onShift') : t('checkIn.offShift')}
            </span>
            <span className="text-xs text-brand-100">
              {isClockedIn && clockInTime ? t('checkIn.since', { time: formatTime(clockInTime) }) : canClockIn ? '' : t('checkIn.opensAt', { time: clockInOpensAt })}
            </span>
          </div>
          <p className="relative mt-4 text-[44px] font-extrabold leading-none tracking-tight tabular-nums">
            {isClockedIn ? formatDuration(stats.totalWorkingMs, language) : formatTime(new Date().toISOString())}
          </p>
          <p className="relative mt-2 text-[13px] text-brand-100">
            {isClockedIn && t('checkIn.workedToday', { active: formatDuration(stats.totalVisitingMs, language) })}
            {!isClockedIn && canClockIn && journey.todaysAttendance.length === 0 && t('home.notStartedYet')}
            {!isClockedIn &&
              canClockIn &&
              journey.todaysAttendance.length > 0 &&
              t('checkIn.clockedInTimes', {
                count: journey.todaysAttendance.length,
                plural: journey.todaysAttendance.length > 1 ? 's' : '',
                duration: formatDuration(stats.totalWorkingMs, language),
              })}
            {!isClockedIn && !canClockIn && !clockInWindowClosed && t('home.clockInOpensAt', { time: clockInOpensAt })}
            {!isClockedIn && clockInWindowClosed && t('home.clockInClosed', { time: shiftTimeOfDay(settings.workEndTime, 0) })}
          </p>
          <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3.5">
            <HeroStat label={t('nav.clockIn')} value={clockInTime ? formatTime(clockInTime) : '—'} />
            <HeroStat label={t('common.clockOut')} value={clockOutTime && !isClockedIn ? formatTime(clockOutTime) : '—'} />
            <HeroStat label={t('nav.visits')} value={String(stats.totalVisits)} />
          </div>
        </div>

        {isClockedIn ? (
          <SlideToConfirm label={t('checkIn.slideToClockOut')} variant="danger" busy={journey.busy} onConfirm={() => setPendingAction('clock-out')} />
        ) : (
          <SlideToConfirm
            label={checkingLocation ? t('home.checkingLocation') : t('checkIn.slideToClockIn')}
            busy={checkingLocation || journey.busy}
            disabled={!canClockIn}
            onConfirm={() => void handleClockInTap()}
          />
        )}
        <p className="-mt-1.5 text-center text-xs text-neutral-500">
          {/* app.clock_out force-checks-out a still-open visit rather than blocking the clock-out -- flagged AUTO_CHECKOUT_CLOCK_OUT. */}
          {isClockedIn && isVisiting ? t('checkIn.alsoCheckOut') : t('checkIn.selfieHint')}
        </p>

        {/* Only one visit can ever be open at a time (app.check_in enforces
            this server-side) -- so once checked in, show that visit instead
            of a button that would just fail. */}
        {isClockedIn &&
          (isVisiting && journey.openVisit ? (
            <CurrentVisitCard
              visit={journey.openVisit}
              customerName={journey.openVisit.customer_id ? customerNames[journey.openVisit.customer_id] : undefined}
              onView={() => setFlowOpen(true)}
            />
          ) : (
            <button
              onClick={() => setFlowOpen(true)}
              disabled={journey.busy}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white tap-target disabled:opacity-40"
            >
              <MapPin className="h-[18px] w-[18px]" /> {t('home.checkInButton')}
            </button>
          ))}

        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-card">
          <ActivityRings
            label={`${t('nav.visits')} ${stats.totalVisits}${visitTarget ? `/${visitTarget}` : ''}, ${t('checkIn.statActive')} ${formatDuration(stats.totalVisitingMs, language)}, ${t('home.effectiveness')} ${effectivenessRatio}%`}
            rings={[
              { progress: visitTarget ? stats.totalVisits / visitTarget : stats.totalVisits > 0 ? 1 : 0, color: '#6552c9' },
              { progress: stats.totalVisitingMs / (ACTIVE_TIME_GOAL_MINUTES * 60_000), color: '#1668b8' },
              { progress: effectivenessRatio / 100 / EFFECTIVENESS_GOAL, color: '#1a9f6e' },
            ]}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{t('checkIn.todaysGoals')}</p>
            <GoalLine tone="text-status-visiting dark:text-violet-300" label={t('nav.visits')} value={visitTarget ? `${stats.totalVisits} / ${visitTarget}` : String(stats.totalVisits)} />
            <GoalLine
              tone="text-brand-600"
              label={t('checkIn.statActive')}
              value={`${formatDuration(stats.totalVisitingMs, language)} / ${formatDuration(ACTIVE_TIME_GOAL_MINUTES * 60_000, language)}`}
            />
            <GoalLine tone="text-status-working dark:text-emerald-300" label={t('home.effectiveness')} value={`${effectivenessRatio}% / ${Math.round(EFFECTIVENESS_GOAL * 100)}%`} />
          </div>
        </div>

        {recentVisits.length > 0 && <RecentVisits visits={recentVisits} customerNames={customerNames} />}
      </div>

      <SelfieCaptureSheet
        open={pendingAction !== null}
        title={pendingAction === 'clock-in' ? t('checkIn.clockInSelfieTitle') : t('checkIn.clockOutSelfieTitle')}
        onCancel={() => setPendingAction(null)}
        onCapture={handleSelfie}
      />

      <VisitFlow open={flowOpen} onClose={() => setFlowOpen(false)} />

      <BottomSheet open={lowAccuracyM !== null} onClose={() => setLowAccuracyM(null)} title={t('home.lowAccuracyTitle')}>
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            {t('home.lowAccuracyBody', {
              accuracy: lowAccuracyM != null ? `${Math.round(lowAccuracyM)} m` : 'too low',
              max: settings.maxLocationAccuracyM,
            })}
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
            {checkingLocation ? t('home.checkingLocation') : t('common.tryAgain')}
          </button>
          <button onClick={() => setLowAccuracyM(null)} className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target">
            {t('common.cancel')}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-brand-100">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold">{value}</p>
    </div>
  )
}

function GoalLine({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${tone}`}>{label}</p>
      <p className="text-[15px] font-extrabold text-neutral-900">{value}</p>
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
  const { t, language } = useLanguage()
  const label = visit.customer_id ? customerName ?? t('common.loading') : t('common.unassignedVisit')
  return (
    <button
      onClick={onView}
      className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-left tap-target"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
        <MapPin className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-status-visiting" /> {t('home.currentlyCheckedIn')}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500">
          {t('home.since', {
            time: formatTime(visit.checked_in_at),
            duration: formatDuration(Date.now() - new Date(visit.checked_in_at).getTime(), language),
          })}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-brand-400" />
    </button>
  )
}

function RecentVisits({ visits, customerNames }: { visits: VisitRow[]; customerNames: Record<string, string> }) {
  const { t, language } = useLanguage()
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <p className="text-[17px] font-bold text-neutral-900">{t('checkIn.recentVisits')}</p>
        <Link to="/footprints" className="py-1.5 text-[13px] font-semibold text-brand-500">
          {t('checkIn.seeJourney')}
        </Link>
      </div>
      <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
        {visits.map((v) => {
          const duration = formatDuration(new Date(v.checked_out_at!).getTime() - new Date(v.checked_in_at).getTime(), language)
          const flagged = (v.flags?.length ?? 0) > 0 || v.out_of_range
          return (
            <div key={v.id} className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-visiting/10 text-status-visiting dark:text-violet-300">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {v.customer_id ? customerNames[v.customer_id] ?? t('common.loading') : t('common.unassignedVisit')}
                </p>
                <p className="text-xs text-neutral-400">{duration}</p>
              </div>
              {flagged && (
                <span className="shrink-0 rounded-full bg-status-warn/10 px-2 py-0.5 text-[10px] font-medium text-status-warn">
                  {t('checkIn.flagged')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AutoClockOutBanner({ clockOutAt, onDismiss }: { clockOutAt: string | null; onDismiss: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="mx-4 mt-4 flex animate-slide-down items-start gap-3 rounded-xl bg-status-warn/10 p-4 md:mx-8">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warn" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-status-warn">{t('checkIn.autoClockOutTitle')}</p>
        <p className="mt-0.5 text-neutral-700">
          {t('checkIn.autoClockOutBody', { time: clockOutAt ? formatTime(clockOutAt) : t('checkIn.endOfDay') })}
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
  const { t } = useLanguage()
  return (
    <div className="mx-4 mt-4 flex animate-slide-down items-start gap-3 rounded-xl bg-status-warn/10 p-4 md:mx-8">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warn" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-status-warn">{t('checkIn.autoCheckOutTitle')}</p>
        <p className="mt-0.5 text-neutral-700">{t('checkIn.autoCheckOutBody', { customer: customerName ?? t('checkIn.yourVisit') })}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {t('checkIn.reasonPrefix')}
          {reason === 'outside_radius' ? t('checkIn.reasonOutsideRadius') : t('checkIn.reasonClockOut')}
          {distance != null && ` · ${t('checkIn.distanceLabel', { n: distance })}`}
        </p>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-neutral-400 tap-target">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
