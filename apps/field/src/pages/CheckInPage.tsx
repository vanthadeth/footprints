import { useVisitOrders, useVisitOrderTotals } from '@/features/orders/useVisitOrders'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock, LogOut, MapPin, MapPinCheck, Moon, Store, X } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'
import { ClockSheet } from '@/features/attendance/ClockSheet'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { FlagRules } from '@/features/attendance/flagRules'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { WeekStrip } from '@/features/checkin/CheckInSections'
import { ApptPlanCard, RecentVisitsCard } from '@/features/checkin/HomeCards'
import { formatMn } from '@/features/checkin/formatMn'
import { DayAlertsStrip } from '@/features/checkin/DayAlertsStrip'
import { dayAlerts } from '@/features/checkin/dayAlerts'
import { TripTodayCard } from '@/features/trips/TripTodayCard'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { DayBar } from '@/features/fleet/DayBar'
import { atLocal, segText, segmentsFor, type Seg } from '@/features/fleet/dayBar'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { LEAVE_TYPE_LABEL, type LeaveType } from '@/features/leave/types'
import { displayName } from '@footprints/shared/lib/displayName'
import { useAppSettings } from '@/hooks/useAppSettings'
import { summarizeAttendanceTimes } from '@/features/attendance/stateMachine'
import { formatDuration, formatTime, isPastTimeOfDay, isWithinClockInWindow, shiftTimeOfDay } from '@footprints/shared/lib/datetime'
import { todayDateString } from '@/lib/dateRange'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useCan } from '@footprints/shared/features/permissions/PermissionsContext'
import { useClockRules } from '@footprints/shared/features/permissions/clockRules'
import { useOrderTargets } from '@/features/orders/useOrderTargets'
import { useMyQuota } from '@/features/attendance/useMyQuota'


export function CheckInPage() {
  const journey = useJourneyContext()
  const { profile } = useProfile()
  const orderTargets = useOrderTargets()
  const quota = useMyQuota(profile?.id ?? null)
  const { t, language } = useLanguage()
  const settings = useAppSettings()
  const [clockSheet, setClockSheet] = useState<'in' | 'out' | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [preset, setPreset] = useState<PresetCustomer | null>(null)
  const clockRules = useClockRules()
  const canPlan = useCan('plan')
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
  const { clockInTime, clockOutTime, clockInLocationId } = summarizeAttendanceTimes(journey.todaysAttendance, journey.openAttendance)
  const locationNames = useLocationNames([clockInLocationId])
  const orderStates = useVisitOrders(journey.todaysVisits)
  const orderTotals = useVisitOrderTotals(journey.todaysVisits)
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
  const today: DayJourney = { date: todayDateString(), attendance: journey.todaysAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today], undefined, { breakMinutes: settings.breakMinutes, breakPaid: settings.breakPaid, start: settings.workStartTime, end: settings.workEndTime }, settings.flagRules, orderStates, undefined, { orderTargetUsd: orderTargets[profile?.id ?? ''] ?? null, orderTotals })

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
      : settings.isWorkingDay && journey.todaysAttendance.length === 0
        ? { text: t('checkIn.startedAgo', { n: formatDuration(-untilStart * 60_000, language) }), tone: untilStart < -settings.lateGraceMinutes ? 'text-[#FFB257]' : 'text-[#74E092]' }
        : null
  const alerts = dayAlerts({
    day: todayDateString(),
    now: Date.now(),
    attendance: journey.todaysAttendance,
    visits: journey.todaysVisits,
    workStart: settings.workStartTime,
    workEnd: settings.workEndTime,
    graceMin: settings.lateGraceMinutes,
    firstVisitDeadline: settings.flagRules.firstVisitDeadline,
    firstVisitFar: settings.flagRules.firstVisitFar,
    clock: (ms) => formatTime(new Date(ms).toISOString()),
  })
  const leaveLabel = leaveToday === 'annual' ? t('profile.annual') : leaveToday === 'sick' ? t('profile.sick') : leaveToday ? LEAVE_TYPE_LABEL[leaveToday] : ''
  const visitTarget = quota.dailyVisitTarget ?? settings.dailyVisitTarget
  const salesTarget = orderTargets[profile?.id ?? ''] ?? 0
  const salesToday = Object.values(orderTotals).reduce((sum, o) => sum + (o.totalUsd ?? 0), 0)
  const orderCount = Object.keys(orderTotals).length

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

      <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3.5 px-4 pt-1.5 md:px-8 md:pt-4">
        {isClockedIn ? (
          /* On shift: the day so far (canvas Check in, clocked in), then Check in or the open visit. */
          <section aria-label={t('checkIn.onShift')} className="rounded-[20px] bg-white p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex h-7 items-center gap-[7px] whitespace-nowrap rounded-full bg-status-working/10 px-3 text-[12.5px] font-bold text-status-working">
                <span className="h-2 w-2 rounded-full bg-current" />
                {t('checkIn.clockedInPill', { time: clockInTime ? formatTime(clockInTime) : '—' })}
              </span>
              <span className="whitespace-nowrap text-[12.5px] font-semibold text-neutral-600">{shiftLabel}</span>
            </div>
            <p className="mt-4 flex items-baseline gap-1.5">
              <b className="text-[32px] font-bold leading-[38px] tracking-[-0.02em] tabular-nums text-neutral-900">{formatMn(stats.totalVisitingMs, t, language)}</b>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-neutral-600">{t('checkIn.withCustomers')}</span>
            </p>
            <div className="mb-6 mt-3">
              <HeroDayBar attendance={journey.todaysAttendance} visits={journey.todaysVisits} workStart={settings.workStartTime} workEnd={settings.workEndTime} flagRules={settings.flagRules} customerNames={customerNames} />
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2.5">
              <GoalTile
                label={t('nav.visits')}
                value={String(stats.totalVisits)}
                unit={visitTarget > 0 ? t('checkIn.ofVisits', { n: visitTarget }) : undefined}
                ratio={visitTarget > 0 ? stats.totalVisits / visitTarget : null}
                note={visitTarget > 0 ? t('checkIn.left', { n: Math.max(0, visitTarget - stats.totalVisits) }) : undefined}
              />
              <GoalTile
                label={t('checkIn.sales')}
                value={`$${Math.round(salesToday).toLocaleString('en-US')}`}
                unit={orderCount > 0 ? `(${orderCount} ${orderCount === 1 ? 'order' : 'orders'})` : undefined}
                ratio={salesTarget > 0 ? salesToday / salesTarget : null}
                note={salesTarget > 0 ? (salesToday >= salesTarget ? t('checkIn.targetReached') : t('checkIn.toGo', { n: `$${Math.round(salesTarget - salesToday).toLocaleString('en-US')}` })) : undefined}
              />
            </div>
            {clockInLocationId && locationNames[clockInLocationId] && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                <MapPin className="h-4 w-4 text-status-working" aria-hidden />
                {locationNames[clockInLocationId]} · {t('checkIn.insideWork')}
              </p>
            )}

            <div className="mt-3.5 flex gap-2">
              {isVisiting && journey.openVisit ? (
                <button type="button" onClick={() => openFlow()} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[14px] bg-brand-50 p-2 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                    <Store className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-status-working">
                      <span className="h-2 w-2 rounded-full bg-status-working" />
                      {t('checkIn.visitInProgress', { duration: formatDuration(Date.now() - new Date(journey.openVisit.checked_in_at).getTime(), language) })}
                    </span>
                    <span className="block truncate text-[15px] font-bold text-neutral-900">
                      {journey.openVisit.customer_id ? (customerNames[journey.openVisit.customer_id] ?? t('common.loading')) : t('common.unassignedVisit')}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openFlow()}
                  disabled={journey.busy}
                  className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] bg-brand-500 text-[15px] font-bold text-white disabled:opacity-60"
                >
                  <MapPinCheck className="h-5 w-5" aria-hidden />
                  {t('checkIn.checkInButton')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setClockSheet('out')}
                disabled={journey.busy}
                aria-label={t('checkIn.clockOutTitle')}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-neutral-300 text-status-danger disabled:opacity-50"
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </div>
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
            <section aria-label={t('checkIn.clockInTitle')} className="pb-1 pt-1 text-center">
              <span className="inline-flex h-7 items-center gap-2 rounded-full bg-white px-3 text-[13px] font-bold text-neutral-600 shadow-card">
                <span className="h-2 w-2 rounded-full bg-neutral-500" />
                {clockOutTime ? t('checkIn.clockedOutAt', { time: formatTime(clockOutTime) }) : t('checkIn.notClockedIn')}
              </span>
              <p className="mt-3 text-[88px] font-extrabold leading-[92px] tracking-tight tabular-nums text-neutral-900">{formatTime(new Date().toISOString())}</p>
              {shiftNote && (
                <p
                  className={`mt-3 inline-flex h-9 items-center gap-2 rounded-full px-4 text-[15px] font-bold ${
                    shiftNote.tone === 'text-[#74E092]' ? 'bg-status-working/10 text-status-working' : shiftNote.tone === 'text-[#FFB257]' ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  <Clock className="h-[17px] w-[17px]" aria-hidden />
                  {shiftNote.text}
                </p>
              )}
              <p className="mt-2 text-[13px] font-semibold text-neutral-500">{shiftLabel}</p>
              {journey.todaysAttendance.length > 0 && (
                <p className="mt-1 text-[13px] text-neutral-500">
                  {t('checkIn.clockedInTimes', {
                    count: journey.todaysAttendance.length,
                    plural: journey.todaysAttendance.length > 1 ? 's' : '',
                    duration: formatDuration(stats.totalWorkingMs, language),
                  })}
                </p>
              )}
            </section>
            <DayAlertsStrip alerts={alerts} />
            <ApptPlanCard variant="before" canPlan={canPlan} />
            <button
              type="button"
              onClick={() => setClockSheet('in')}
              disabled={!canClockIn || journey.busy}
              className="mt-auto flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 text-[17px] font-bold text-white disabled:opacity-50"
            >
              <Clock className="h-[22px] w-[22px]" aria-hidden />
              {journey.todaysAttendance.length > 0 ? t('checkIn.clockInAgain') : t('checkIn.clockInCta')}
            </button>
          </>
        )}

        {isClockedIn && <DayAlertsStrip alerts={alerts} />}
        {isClockedIn && <TripTodayCard />}
        {isClockedIn ? (
          /* On shift: the plan, then today's appointments. */
          <>
            <ApptPlanCard variant="on" canPlan={canPlan} onCheckIn={(stop) => openFlow({ id: stop.customer_id, shopName: stop.shop_name })} busy={journey.busy || isVisiting} />
            <RecentVisitsCard />
          </>
        ) : (
          /* Before clock-in: nothing below the slide, as on the canvas. */
          leaveToday ? <WeekStrip /> : null
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

/**
 * The day so far as the canvas's "Your day" bar (Polish › Check in): from
 * clock-in to the end of the shift, edge to edge -- early time in green,
 * travel and gaps dimmed, the part of a gap past the idle limit amber,
 * visits blue, and what's still to come faint. Tap or hover a stretch to see
 * what it was.
 */
function HeroDayBar({
  attendance,
  visits,
  workStart,
  workEnd,
  flagRules,
  customerNames,
}: {
  attendance: AttendanceRow[]
  visits: VisitRow[]
  workStart: string
  workEnd: string
  flagRules: FlagRules
  customerNames: Record<string, string>
}) {
  if (attendance.length === 0) return null
  const now = Date.now()
  const day = todayDateString()
  const shiftStart = atLocal(day, workStart)
  const shiftEnd = atLocal(day, workEnd)
  const { segs, live, clockIn, clockOut } = segmentsFor({ attendance, visits, shiftStart, shiftEnd, now, flagRules })
  const from = clockIn!
  const to = Math.max(shiftEnd, clockOut ?? now)
  const name = (g: Seg) => (g.visit != null ? (customerNames[live[g.visit]?.customer_id ?? ''] ?? null) : null)
  return (
    <DayBar
      segs={segs}
      from={from}
      to={to}
      size="flat"
      tone="card"
      className=""
      label={`${live.length} ${live.length === 1 ? 'visit' : 'visits'} since ${formatTime(new Date(from).toISOString())}`}
      describe={(g) => segText(g, name(g))}
    />
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

/** A Visits / Sales tile: label and note on one line, the value, then a thin progress bar. */
function GoalTile({ label, value, unit, ratio, note }: { label: string; value: string; unit?: string; ratio: number | null; note?: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 rounded-2xl bg-neutral-100 px-3.5 py-3">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-neutral-600">{label}</span>
      <span className="whitespace-nowrap text-xs font-semibold text-neutral-600">{note}</span>
      <p className="col-span-2 whitespace-nowrap text-[12.5px] text-neutral-600">
        <b className="text-xl font-bold text-neutral-900">{value}</b> {unit}
      </p>
      <span className="col-span-2 mt-0.5 block h-2 overflow-hidden rounded-full bg-neutral-200">
        {ratio != null && <i className="block h-2 rounded-full bg-brand-500" style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }} />}
      </span>
    </div>
  )
}
