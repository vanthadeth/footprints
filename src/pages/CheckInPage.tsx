import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, CalendarPlus, Check, ChevronDown, ChevronRight, Clock, LogOut, MapPin, Moon, Store, X } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'
import { ClockSheet } from '@/features/attendance/ClockSheet'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { HeroLocationCard, PlanSection, TodayCard, TodaysTimeline, WeekStrip } from '@/features/checkin/CheckInSections'
import { TripTodayCard } from '@/features/trips/TripTodayCard'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { LEAVE_TYPE_LABEL, type LeaveType } from '@/features/leave/types'
import { displayName } from '@/lib/displayName'
import { useAppSettings } from '@/hooks/useAppSettings'
import { summarizeAttendanceTimes } from '@/features/attendance/stateMachine'
import { greeting, formatDuration, formatTime, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '@/lib/datetime'
import { todayDateString } from '@/lib/dateRange'
import { useProfile } from '@/features/auth/useProfile'
import { useLanguage } from '@/i18n/LanguageContext'
import { useCan } from '@/features/permissions/PermissionsContext'
import { useClockRules } from '@/features/permissions/clockRules'


export function CheckInPage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const settings = useAppSettings()
  const [clockSheet, setClockSheet] = useState<'in' | 'out' | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [preset, setPreset] = useState<PresetCustomer | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const clockRules = useClockRules()
  const canPlan = useCan('plan')
  const canFootprints = useCan('footprints')
  const leaveToday = useApprovedLeaveOnDate(profile ? [profile.id] : [], todayDateString())[profile?.id ?? ''] as LeaveType | undefined

  const autoCheckoutCustomerId = journey.lastAutoCheckout?.visit.customer_id ?? null
  const openFlow = (p: PresetCustomer | null = null) => {
    setPreset(p)
    setFlowOpen(true)
  }
  const customerNames = useCustomerNames([autoCheckoutCustomerId, journey.openVisit?.customer_id ?? null, ...journey.todaysVisits.map((v) => v.customer_id)])
  // Computed above the loading guard below (hooks can't follow a
  // conditional return) -- summarizeAttendanceTimes handles an empty
  // todaysAttendance fine, returning all-null.
  const { clockInTime, clockInLocationId } = summarizeAttendanceTimes(journey.todaysAttendance, journey.openAttendance)
  const locationNames = useLocationNames([clockInLocationId])
  const firstName = profile ? displayName(profile.full_name, profile.nickname).split(' ')[0] : undefined

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

  const minutesNow = (() => {
    const [h, m] = formatTime(new Date().toISOString()).split(':').map(Number)
    return h * 60 + m
  })()
  const [sh, sm] = settings.workStartTime.split(':').map(Number)
  const untilStart = sh * 60 + sm - minutesNow
  const shiftLabel = settings.holidayName
    ? settings.holidayName
    : !settings.isWorkingDay
      ? t('checkIn.dayOff')
      : t('checkIn.shift', { start: settings.workStartTime.slice(0, 5), end: settings.workEndTime.slice(0, 5) })
  const shiftNote = !canClockIn
    ? clockInWindowClosed
      ? { text: t('checkIn.clockInClosedShort'), tone: 'text-heroMuted' }
      : { text: t('checkIn.clockInOpensShort', { time: clockInOpensAt }), tone: 'text-heroMuted' }
    : untilStart > 0
      ? { text: t('checkIn.startsIn', { n: formatDuration(untilStart * 60_000, language) }), tone: 'text-[#74E092]' }
      : untilStart < 0 && journey.todaysAttendance.length === 0
        ? { text: t('checkIn.lateBy', { n: formatDuration(-untilStart * 60_000, language) }), tone: 'text-[#FFB257]' }
        : null
  const leaveLabel = leaveToday === 'annual' ? t('profile.annual') : leaveToday === 'sick' ? t('profile.sick') : leaveToday ? LEAVE_TYPE_LABEL[leaveToday] : ''
  const visitsLine = stats.totalVisits === 0 ? t('checkIn.noVisitsYet') : t('checkIn.visitsSoFar', { n: stats.totalVisits })

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      {journey.error && !clockSheet && (
        <div role="alert" className="mx-4 mt-4 rounded-xl bg-status-danger/10 px-3 py-2.5 text-sm font-semibold text-status-danger md:mx-8">
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

      <div className="space-y-3.5 px-4 pt-1.5 md:px-8 md:pt-4">
        {isClockedIn ? (
          /* On shift: time worked, clock out, the day so far, then Check in (or the open visit). */
          <section aria-label={t('checkIn.onShift')} className="relative overflow-hidden rounded-[22px] bg-brand-900 px-[18px] py-4 text-white">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-[7px] text-[13px] font-bold text-[#74E092]">
                <span className="h-2 w-2 rounded-full bg-[#17CB49]" />
                {t('checkIn.onShift')}
                {clockInTime ? ` · ${t('checkIn.since', { time: formatTime(clockInTime) }).toLowerCase()}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="inline-flex h-[30px] items-center gap-1 rounded-full bg-white/10 px-2.5 text-[13px] font-bold"
              >
                {detailsOpen ? t('checkIn.hideDetails') : t('checkIn.shiftDetails')}
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[32px] font-extrabold leading-[38px] tracking-tight tabular-nums">{formatDuration(stats.totalWorkingMs, language)}</p>
                <p className="mt-0.5 text-[13px] text-white/60">{t('checkIn.workedLabel')}</p>
              </div>
              <button
                type="button"
                onClick={() => setClockSheet('out')}
                disabled={journey.busy}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/30 bg-white/[.08] px-3.5 text-sm font-bold text-[#ffb8b8] disabled:opacity-50"
              >
                <LogOut className="h-[17px] w-[17px]" aria-hidden />
                {t('checkIn.clockOutTitle')}
              </button>
            </div>
            <DayBar attendance={journey.todaysAttendance} visits={journey.todaysVisits} workStart={settings.workStartTime} workEnd={settings.workEndTime} />
            <p className="mt-2 text-[13px] text-white/60">{visitsLine}</p>

            {isVisiting && journey.openVisit ? (
              <button
                type="button"
                onClick={() => openFlow()}
                className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-[#ffffff] p-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                  <Store className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-status-working">
                    <span className="h-2 w-2 rounded-full bg-status-working" />
                    {t('checkIn.visitInProgress', { duration: formatDuration(Date.now() - new Date(journey.openVisit.checked_in_at).getTime(), language) })}
                  </span>
                  <span className="block truncate text-[15px] font-bold text-[#232323]">
                    {journey.openVisit.customer_id ? (customerNames[journey.openVisit.customer_id] ?? t('common.loading')) : t('common.unassignedVisit')}
                  </span>
                  <span className="block text-xs text-[#666666]">{t('checkIn.checkedInAt', { time: formatTime(journey.openVisit.checked_in_at) })}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-[#006ACC]">
                  {t('checkIn.goToVisit')}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openFlow()}
                disabled={journey.busy}
                className="mt-3 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#ffffff] text-base font-extrabold text-[#2b2b2b] disabled:opacity-60"
              >
                <MapPin className="h-5 w-5" aria-hidden />
                {t('checkIn.checkInButton')}
              </button>
            )}

            {detailsOpen && (
              <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
                <div className="grid grid-cols-3">
                  <HeroFact label={t('nav.visits')} value={String(stats.totalVisits)} />
                  <HeroFact label={t('checkIn.statActive')} value={formatDuration(stats.totalVisitingMs, language)} />
                  <HeroFact label={t('checkIn.effectiveness')} value={stats.totalWorkingMs > 0 ? `${effectivenessRatio}%` : '—'} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/[.06] px-3 py-2.5">
                    <p className="text-xs text-white/60">{t('checkIn.clockedIn')}</p>
                    <p className="mt-0.5 truncate text-sm font-bold">
                      {clockInTime ? formatTime(clockInTime) : '—'}
                      {clockInLocationId && locationNames[clockInLocationId] ? ` · ${locationNames[clockInLocationId]}` : ''}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[.06] px-3 py-2.5">
                    <p className="text-xs text-white/60">{t('checkIn.shiftLabel')}</p>
                    <p className="mt-0.5 truncate text-sm font-bold">{shiftLabel}</p>
                  </div>
                </div>
                <p className="text-[12.5px] text-white/60">{isVisiting ? t('checkIn.alsoCheckOut') : t('checkIn.confirmOutNote')}</p>
              </div>
            )}
          </section>
        ) : leaveToday ? (
          /* Approved leave today: no clock-in needed, but working anyway is still possible. */
          <>
            <section aria-label={t('checkIn.onLeaveToday')} className="relative overflow-hidden rounded-[22px] bg-brand-900 px-[18px] pb-[18px] pt-[18px] text-white">
              <HeroRings />
              <span className="relative inline-flex h-[26px] items-center gap-[7px] rounded-full bg-[rgba(159,179,200,.16)] px-2.5 text-xs font-bold text-[#cfe0f0]">
                <Moon className="h-[13px] w-[13px]" aria-hidden />
                {t('checkIn.onLeaveToday')}
              </span>
              <p className="relative mt-3.5 text-[15px] font-semibold text-white/60">
                {t('checkIn.enjoyDayOff')}
                {firstName ? `, ${firstName}` : ''}
              </p>
              <p className="relative mt-0.5 text-[36px] font-extrabold leading-[42px] tracking-tight">{t('checkIn.leaveTitle', { type: leaveLabel })}</p>
              <div className="relative mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-white/[.07] px-3 py-2.5">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(23,203,73,.2)] text-[#74E092]">
                  <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                </span>
                <span className="text-sm font-bold">{t('checkIn.leaveApproved')}</span>
              </div>
            </section>
            <section aria-label={t('checkIn.needToWork')} className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
              <p className="text-[15px] font-extrabold text-neutral-900">{t('checkIn.needToWork')}</p>
              <p className="mt-1 text-[13px] leading-[18px] text-neutral-500">{t('checkIn.needToWorkBody')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClockSheet('in')}
                  disabled={!canClockIn || journey.busy}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900 disabled:opacity-50"
                >
                  <Clock className="h-[17px] w-[17px]" aria-hidden />
                  {t('checkIn.clockInAnyway')}
                </button>
                <Link to="/leave" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
                  <CalendarDays className="h-[17px] w-[17px]" aria-hidden />
                  {t('checkIn.changeLeave')}
                </Link>
              </div>
            </section>
          </>
        ) : (
          /* Before clock-in: the time, the shift, and one big Clock in. */
          <>
            <section aria-label={t('checkIn.clockInTitle')} className="relative overflow-hidden rounded-[22px] bg-brand-900 px-[18px] pb-4 pt-[18px] text-white">
              <HeroRings />
              <span className="relative inline-flex h-[26px] items-center gap-[7px] rounded-full bg-white/[.08] px-2.5 text-xs font-bold text-white/70">
                <span className="h-2 w-2 rounded-full border-2 border-white/70" />
                {t('checkIn.notClockedIn')}
              </span>
              <p className="relative mt-3.5 text-[15px] font-semibold text-white/60">
                {greeting(undefined, language)}
                {firstName ? `, ${firstName}` : ''}
              </p>
              <p className="relative mt-0.5 text-[48px] font-extrabold leading-[54px] tracking-tight tabular-nums">{formatTime(new Date().toISOString())}</p>
              <p className="relative mt-0.5 text-sm text-white/60">
                {shiftLabel}
                {shiftNote && (
                  <>
                    {' · '}
                    <span className={`font-bold ${shiftNote.tone === 'text-heroMuted' ? '' : shiftNote.tone}`}>{shiftNote.text}</span>
                  </>
                )}
              </p>
              {journey.todaysAttendance.length > 0 && (
                <p className="relative mt-2 text-[13px] text-white/60">
                  {t('checkIn.clockedInTimes', {
                    count: journey.todaysAttendance.length,
                    plural: journey.todaysAttendance.length > 1 ? 's' : '',
                    duration: formatDuration(stats.totalWorkingMs, language),
                  })}
                </p>
              )}
              {canClockIn && <HeroLocationCard required={clockRules.in} />}
              <button
                type="button"
                onClick={() => setClockSheet('in')}
                disabled={!canClockIn || journey.busy}
                className="relative mt-3.5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#ffffff] text-[17px] font-extrabold text-[#2b2b2b] disabled:opacity-50"
              >
                <Clock className="h-[22px] w-[22px]" aria-hidden />
                {t('checkIn.clockInButton')}
              </button>
              <p className="relative mt-2.5 text-center text-xs text-white/60">{t('checkIn.confirmInNote')}</p>
            </section>
            {journey.todaysAttendance.length === 0 && (
              <Link to="/leave" className="flex h-12 items-center gap-3 rounded-[14px] border border-neutral-100 bg-white px-3.5 text-sm font-bold text-neutral-900 shadow-card">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand-50 text-brand-500">
                  <CalendarPlus className="h-[17px] w-[17px]" aria-hidden />
                </span>
                <span className="flex-1">
                  {t('checkIn.notWorkingToday')} <span className="text-brand-500">{t('checkIn.requestLeave')}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
              </Link>
            )}
          </>
        )}

        <TripTodayCard />
        {isClockedIn ? (
          /* On shift: the next stop and the plan (or a nudge to build one), then today as a timeline. */
          <>
            {canPlan && <PlanSection onCheckIn={(stop) => openFlow({ id: stop.customer_id, shopName: stop.shop_name })} busy={journey.busy || isVisiting} />}
            <TodaysTimeline
              visits={journey.todaysVisits}
              customerNames={customerNames}
              clockInAt={clockInTime}
              clockInPlace={clockInLocationId ? (locationNames[clockInLocationId] ?? null) : null}
              shiftStart={settings.workStartTime}
              showJourney={canFootprints}
            />
          </>
        ) : (
          /* Before clock-in (or on leave): what today holds, and this week's attendance. */
          <>
            <TodayCard canPlan={canPlan} />
            <WeekStrip />
          </>
        )}
      </div>

      <ClockSheet open={clockSheet !== null} direction={clockSheet ?? 'in'} required={clockSheet === 'out' ? clockRules.out : clockRules.in} onClose={() => setClockSheet(null)} />

      <VisitFlow open={flowOpen} onClose={() => setFlowOpen(false)} presetCustomer={preset} />
    </div>
  )
}

/** Concentric rings in the hero's top-right corner, as on the canvas. */
function HeroRings() {
  return (
    <svg width="190" height="190" viewBox="0 0 190 190" aria-hidden className="pointer-events-none absolute -right-[54px] -top-[54px] opacity-90">
      <circle cx="95" cy="95" r="90" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="1" />
      <circle cx="95" cy="95" r="64" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="1" />
    </svg>
  )
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/60">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold">{value}</p>
    </div>
  )
}

/**
 * The day so far, clock-in to the end of the shift: early/late time outside
 * working hours in green, visits in blue, travel and gaps dimmed, and what's
 * still to come faint. Same colours as the canvas's "Your day" bar.
 */
function DayBar({ attendance, visits, workStart, workEnd }: { attendance: AttendanceRow[]; visits: VisitRow[]; workStart: string; workEnd: string }) {
  if (attendance.length === 0) return null
  const now = Date.now()
  const start = Math.min(...attendance.map((a) => new Date(a.clock_in_at).getTime()))
  const [sh, sm] = workStart.split(':').map(Number)
  const [eh, em] = workEnd.split(':').map(Number)
  const shiftMs = Math.max(60, eh * 60 + em - (sh * 60 + sm)) * 60_000
  const end = Math.max(now, start + shiftMs)
  const pct = (ms: number) => `${(((ms - start) / (end - start)) * 100).toFixed(2)}%`
  const width = (a: number, b: number) => `max(2px, ${(((b - a) / (end - start)) * 100).toFixed(2)}%)`
  const worked = attendance.map((a) => [new Date(a.clock_in_at).getTime(), a.clock_out_at ? new Date(a.clock_out_at).getTime() : now] as const)
  const done = visits.filter((v) => !v.cancelled_at).map((v) => [new Date(v.checked_in_at).getTime(), v.checked_out_at ? new Date(v.checked_out_at).getTime() : now] as const)
  return (
    <div role="img" aria-label={`${done.length} visits since ${formatTime(new Date(start).toISOString())}`} className="relative mt-3 h-5 overflow-hidden rounded-[4px] bg-white/[.08]">
      {worked.map(([a, b]) => (
        <span key={`w${a}`} className="absolute inset-y-0 rounded-[4px] bg-white/30" style={{ left: pct(a), width: width(a, b) }} />
      ))}
      {done.map(([a, b]) => (
        <span key={`v${a}`} className="absolute inset-y-0 rounded-[4px] bg-[#5aa2ea]" style={{ left: pct(a), width: width(a, b) }} />
      ))}
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
