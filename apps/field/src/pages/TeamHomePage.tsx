import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarRange, CheckSquare, ChevronDown, ChevronRight, MapPin, UserX, type LucideIcon } from 'lucide-react'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { NotificationRow } from '@/features/notifications/NotificationRow'
import { DAY_BAR_LEGEND, daySegments } from '@/features/fleet/dayBar'
import { DayBar, DayBarSwatch } from '@/features/fleet/DayBar'
import { firstClockIn, lastClockOut } from '@/features/attendance/sessions'
import { useFleet } from '@/features/fleet/useFleet'
import { flexService, type FlexTeamRow } from '@/features/flex/flexService'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove } from '@/features/nav/navConfig'
import { useCan } from '@footprints/shared/features/permissions/PermissionsContext'
import { displayName } from '@/lib/displayName'
import { days } from '@/features/flex/flex'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useFleetHistory } from '@/features/reports/useFleetHistory'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { DesktopPage } from '@footprints/shared/components/desktop/DesktopPage'
import { useIsWide } from '@/hooks/useIsDesktop'
import { getPresetRange, localDateKey, todayDateString } from '@/lib/dateRange'
import { useAttendanceDays } from '@/features/attendanceSummary/useAttendanceDays'
import { useTeamWorkDays } from '@/features/schedule/useTeamWorkDays'
import { countsAsOrdered } from '@/features/orders/orderReconcile'
import { useVisitOrders, useVisitOrderTotals } from '@/features/orders/useVisitOrders'
import { useOrderTargets } from '@/features/orders/useOrderTargets'
import { formatScore, meanScore, scoreDay, scoreTextClass } from '@/features/attendance/effectivenessScore'
import { visitSpan } from '@/features/attendance/flagRules'
import { formatDuration, formatTime } from '@/lib/datetime'

interface Need {
  key: string
  icon: LucideIcon
  tone: string
  title: string
  sub: string
  to: string
  action: string
}

/**
 * Team (home tab for managers and admins): what needs a decision or a call
 * first -- requests waiting, people not clocked in, flexible days off over
 * the allowance -- then live status, a preview of the people and the team
 * tools. The full live list, map and reports stay under /fleet.
 */
export function TeamHomePage() {
  const { snapshots: all, loading } = useFleet()
  const { ctx } = useRoleGroup()
  const pending = usePendingApprovals(canApprove(ctx))
  const canBriefing = useCan('customer_briefing')
  const [flex, setFlex] = useState<FlexTeamRow[]>([])
  const settings = useAppSettings()
  const { notifications } = useNotificationsContext()
  const recent = notifications.slice(0, 4)
  const { language } = useLanguage()
  const wide = useIsWide()

  useEffect(() => {
    let cancelled = false
    flexService
      .team()
      .then((r) => !cancelled && setFlex(r))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const field = useMemo(() => all.filter((s) => s.member.isFieldSales), [all])
  const notIn = field.filter((s) => s.status === 'OFF' && !s.attendance)
  const overFlex = flex.filter((r) => r.isFlexible && r.left < 0)

  const needs: Need[] = [
    ...(pending ? [{ key: 'approvals', icon: CheckSquare, tone: 'bg-status-warn/10 text-status-warn', title: `${pending} request${pending === 1 ? '' : 's'} to decide`, sub: 'Leave and flexible days off', to: '/approvals', action: 'Review' }] : []),
    ...(notIn.length
      ? [{ key: 'notin', icon: UserX, tone: 'bg-status-danger/10 text-status-danger', title: notIn.length === 1 ? `${displayName(notIn[0].member.fullName, notIn[0].member.nickname)} hasn’t clocked in` : `${notIn.length} people haven’t clocked in`, sub: notIn.slice(0, 3).map((s) => displayName(s.member.fullName, s.member.nickname)).join(', '), to: '/fleet', action: 'See' }]
      : []),
    ...(overFlex.length
      ? [{ key: 'flex', icon: CalendarRange, tone: 'bg-status-visiting/10 text-status-visiting', title: overFlex.length === 1 ? `${overFlex[0].name} is over the flexible allowance` : `${overFlex.length} people over the flexible allowance`, sub: overFlex.map((r) => `${r.name} +${days(-r.left)}`).join(', '), to: '/leave/flexible', action: 'See' }]
      : []),
  ]

  const today = todayDateString()
  const ids = useMemo(() => field.map((s) => s.member.id), [field])
  const leave = useApprovedLeaveOnDate(ids, today)
  const workDays = useTeamWorkDays(today)
  const weekRange = useMemo(() => getPresetRange('this_week'), [])
  const week = useFleetHistory(ids, weekRange)
  const [filter, setFilter] = useState<Filter>('all')
  const [alertsOpen, setAlertsOpen] = useState(false)
  const now = Date.now()

  const statusOf = (s: (typeof field)[number]): Filter => (leave[s.member.id] && !s.attendance ? 'leave' : s.status === 'VISITING' ? 'visiting' : s.status === 'IDLING' ? 'idle' : 'notin')
  const worked = field.filter((s) => s.attendance)

  const weekVisits = week.visits.length
  const weekOrderStates = useVisitOrders(week.visits)
  const weekOrderTotals = useVisitOrderTotals(week.visits)
  const orderTargets = useOrderTargets()
  const weekOrdered = week.visits.filter((v) => countsAsOrdered(weekOrderStates[v.id])).length
  // A visit nobody checked out of counts at most the cap.
  const visitMsOf = (v: { checked_in_at: string; checked_out_at: string | null; flags?: string[] | null }) => {
    const [a, b] = visitSpan(v, now, settings.flagRules.forgottenCapMin)
    return b - a
  }
  // Paid working time (clocked in less the unpaid break) as the server counts it, per person per day.
  const weekDays = useAttendanceDays(localDateKey(weekRange.startIso), today, ids)
  // The week's score: the average of each person-day's score. The server rows give each day's paid time and the person's hours.
  const weekScore = meanScore(
    weekDays.rows
      .filter((r) => r.firstIn)
      .map((r) => {
        const sessions = week.attendance.filter((a) => a.user_id === r.userId && localDateKey(a.clock_in_at) === r.day)
        const visits = week.visits.filter((v) => v.user_id === r.userId && localDateKey(v.checked_in_at) === r.day)
        const rule = { breakMinutes: 0, breakPaid: true, start: r.scheduledStart ?? undefined, end: r.scheduledEnd ?? undefined }
        return scoreDay(sessions.length ? sessions : [{ clock_in_at: r.firstIn!, clock_out_at: r.lastOut }], visits, r.day, rule, now, settings.flagRules, r.workedMinutes * 60_000, weekOrderStates, { late: r.status === 'late', leaveFraction: r.leaveFraction, breakRule: { breakMinutes: settings.breakMinutes, breakPaid: settings.breakPaid }, orderTargetUsd: orderTargets[r.userId] ?? null, orderTotals: weekOrderTotals }).score
      })
  )

  const count = (k: Filter) => (k === 'all' ? field.length : field.filter((s) => statusOf(s) === k).length)
  const shown = field.filter((s) => filter === 'all' || statusOf(s) === filter)
  // One time range for every bar, so they line up under the ticks: half an hour before the shift to its end,
  // stretched for anyone who clocked in earlier or is still working later.
  // Each bar is judged against that person's own shift; the axis spans the earliest start to the latest end.
  const atToday = (hhmm: string) => new Date(`${today}T${hhmm.slice(0, 5)}:00+07:00`).getTime()
  const shiftOf = (id: string) => ({ start: atToday(workDays[id]?.start ?? settings.workStartTime), end: atToday(workDays[id]?.end ?? settings.workEndTime) })
  const shifts = field.map((s) => shiftOf(s.member.id))
  const shiftStart = shifts.length ? Math.min(...shifts.map((x) => x.start)) : atToday(settings.workStartTime)
  const shiftEnd = shifts.length ? Math.max(...shifts.map((x) => x.end)) : atToday(settings.workEndTime)
  const clocked = field.filter((s) => s.sessions.length)
  const rangeFrom = Math.min(shiftStart - 30 * 60_000, ...clocked.map((s) => Date.parse(firstClockIn(s.sessions)!)))
  const rangeTo = Math.max(shiftEnd, ...clocked.map((s) => { const out = lastClockOut(s.sessions); return out ? Date.parse(out) : now }))
  const tickAt = (ms: number) => ((ms - rangeFrom) / (rangeTo - rangeFrom)) * 100
  const noon = new Date(`${today}T12:00:00+07:00`).getTime()
  const ticks = [
    { at: shiftStart, label: formatTime(new Date(shiftStart).toISOString()) },
    ...(noon > shiftStart + 90 * 60_000 && noon < shiftEnd - 90 * 60_000 ? [{ at: noon, label: '12:00' }] : []),
    { at: shiftEnd, label: formatTime(new Date(shiftEnd).toISOString()) },
  ]

  const summaryLine = (
      <p className="text-[14px] text-neutral-600">
        {field.length} {field.length === 1 ? 'person' : 'people'} · {worked.length} in the field{count('leave') ? ` · ${count('leave')} on leave` : ''}
      </p>
  )

  const needsCard = (
      <div className="rounded-2xl border border-neutral-100 bg-white px-3.5 pb-1 pt-3 shadow-card">
        <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Needs you · {needs.length}</p>
        {needs.length === 0 && <p className="py-3 text-[13.5px] text-neutral-500">{loading ? 'Checking…' : 'All clear — nothing waiting on you.'}</p>}
        {needs.map((n, i) => (
          <Link key={n.key} to={n.to} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${n.tone}`}>
              <n.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-neutral-900">{n.title}</span>
              <span className="block truncate text-[12px] text-neutral-500">{n.sub}</span>
            </span>
            <span className="text-[13px] font-bold text-brand-600">{n.action}</span>
          </Link>
        ))}
      </div>
  )

  const alertsCard =
    recent.length > 0 ? (
        <section aria-label="Recent alerts" className="rounded-2xl border border-neutral-100 bg-white px-3.5 pb-1 pt-3 shadow-card">
          <div className={`flex items-center justify-between ${alertsOpen ? 'mb-1' : 'mb-2'}`}>
            <button type="button" onClick={() => setAlertsOpen((o) => !o)} aria-expanded={alertsOpen} className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">
              <ChevronDown className={`h-4 w-4 transition-transform ${alertsOpen ? '' : '-rotate-90'}`} aria-hidden />
              Recent alerts · {recent.length}
            </button>
            <Link to="/notifications" className="text-[13px] font-bold text-brand-600">
              See all
            </Link>
          </div>
          {alertsOpen && recent.map((n, i) => (
            <Link key={n.id} to="/notifications" className={`block py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
              <NotificationRow notification={n} compact />
            </Link>
          ))}
        </section>
    ) : null

  const peopleCard = (
      <section aria-label="People" className="rounded-2xl border border-neutral-100 bg-white px-3.5 pb-3 pt-3 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">People</p>
          <Link to="/fleet?tab=map" className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600">
            <MapPin className="h-4 w-4" aria-hidden /> Team map
          </Link>
        </div>
        <div role="tablist" aria-label="Filter by status" className="mt-2 flex gap-0.5 rounded-xl bg-neutral-100 p-[3px]">
          {FILTERS.map(([k, l, dot]) => {
            const on = filter === k
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(k)}
                className={`flex min-w-0 flex-1 flex-col items-center rounded-[9px] py-1 ${on ? 'seg-on shadow-sm' : ''}`}
              >
                <span className={`inline-flex items-center gap-1 text-[15px] ${on ? 'font-extrabold text-neutral-900' : 'font-bold text-neutral-500'}`}>
                  {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
                  {count(k)}
                </span>
                <span className={`text-[10.5px] ${on ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-500'}`}>{l}</span>
              </button>
            )
          })}
        </div>
        {shown.some((s) => statusOf(s) !== 'leave') && (
          <div aria-hidden className="relative ml-12 mt-3 h-3.5 text-[10px] font-semibold text-neutral-500 lg:ml-[calc(3rem+18rem+1.5rem)]">
            {ticks.map((k, i) => (
              <span key={k.label} className="absolute whitespace-nowrap" style={{ left: `${tickAt(k.at).toFixed(2)}%`, transform: `translateX(${i === ticks.length - 1 && tickAt(k.at) > 90 ? '-100%' : '-50%'})` }}>
                {k.label}
              </span>
            ))}
          </div>
        )}
        {loading && field.length === 0 && <div className="mt-2 h-24 animate-pulse rounded-xl bg-neutral-100" />}
        {shown.map((s) => {
          const st = statusOf(s)
          const name = displayName(s.member.fullName, s.member.nickname)
          const done = s.visitsToday.filter((v) => !v.cancelled_at)
          const firstIn = firstClockIn(s.sessions)
          const lastOut = lastClockOut(s.sessions)
          const visitMs = done.reduce((n, v) => n + visitMsOf(v), 0)
          const own = shiftOf(s.member.id)
          const score = scoreDay(s.sessions, done, today, workDays[s.member.id], now, settings.flagRules, undefined, weekOrderStates, { orderTargetUsd: orderTargets[s.member.id] ?? null, orderTotals: weekOrderTotals }).score
          const sub =
            st === 'visiting' && s.openVisit
              ? `On a visit · ${formatDuration(now - Date.parse(s.openVisit.checked_in_at), language)}`
              : st === 'idle'
                ? `Between visits${done.length ? ` · last ${formatTime(done[done.length - 1].checked_out_at ?? done[done.length - 1].checked_in_at)}` : ''}`
                : st === 'leave'
                  ? 'On leave today'
                  : lastOut
                    ? `Clocked out ${formatTime(lastOut)}`
                    : 'Not clocked in'
          const segs =
            st === 'leave'
              ? []
              : daySegments({
                  clockIn: firstIn ? Date.parse(firstIn) : null,
                  clockOut: lastOut ? Date.parse(lastOut) : null,
                  sessions: s.sessions.map((a) => [Date.parse(a.clock_in_at), a.clock_out_at ? Date.parse(a.clock_out_at) : null]),
                  visits: done.map((v) => {
                    const [a, b] = visitSpan(v, now, settings.flagRules.forgottenCapMin)
                    return [a, v.checked_out_at ? b : null] as [number, number | null]
                  }),
                  shiftStart: own.start,
                  shiftEnd: own.end,
                  now,
                  idle: settings.flagRules.idle,
                })
          const barLabel = firstIn
            ? `Clocked in ${formatTime(firstIn)}${s.sessions.length > 1 ? ` (${s.sessions.length} sessions)` : ''}, ${done.length} ${done.length === 1 ? 'visit' : 'visits'}, ${formatDuration(visitMs, language)} on visits`
            : `No clock-in since ${formatTime(new Date(own.start).toISOString())}`
          return (
            <Link key={s.member.id} to={`/team/footprints/${s.member.id}`} state={{ name, sub: [s.member.position, s.member.departmentName].filter(Boolean).join(' · ') }} className="flex items-start gap-3 border-t border-neutral-100 py-2.5 first-of-type:border-t-0 dark:border-neutral-800">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">
                {name.slice(0, 2).toUpperCase()}
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#232323] ${DOT[st]}`} />
              </span>
              <span className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-6">
                <span className="block min-w-0 lg:w-72 lg:shrink-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-bold text-neutral-900">{name}</span>
                  <span className="shrink-0 text-xs font-bold text-neutral-900">{s.attendance ? `${done.length} ${done.length === 1 ? 'visit' : 'visits'}` : '—'}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-xs ${st === 'notin' ? 'font-semibold text-status-danger' : 'text-neutral-500'}`}>{sub}</span>
                  {score != null && <span className={`shrink-0 text-xs font-bold ${scoreTextClass(score)}`}>Score {formatScore(score)}</span>}
                </span>
                </span>
                {segs.length > 0 && <DayBar segs={segs} from={rangeFrom} to={rangeTo} label={barLabel} className="mt-2.5 lg:mt-0 lg:min-w-0 lg:flex-1" />}
              </span>
            </Link>
          )
        })}
        {!loading && shown.length === 0 && <p className="py-3 text-[13px] text-neutral-500">Nobody here right now.</p>}
        <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-neutral-100 pt-2.5 text-[11px] text-neutral-500 dark:border-neutral-800">
          {DAY_BAR_LEGEND.map(([k, l]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <DayBarSwatch kind={k} /> {l}
            </span>
          ))}
        </div>
      </section>
  )

  const reportCard = (
      <Link to="/fleet" aria-label={`Open team report: this week, ${weekVisits} visits, ${weekOrdered} ordered, score ${formatScore(weekScore)}`} className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500">This week</span>
          <span className="block text-[15px] font-bold text-neutral-900">Team report</span>
          <span className="block truncate text-xs text-neutral-500">Visits, orders, score and attendance, by person</span>
          <span className="mt-1 flex gap-3 text-xs text-neutral-600">
            <span>
              <b className="text-neutral-900">{weekVisits}</b> visits
            </span>
            <span>
              <b className="text-neutral-900">{weekOrdered}</b> ordered
            </span>
            <span>
              <b className="text-neutral-900">{formatScore(weekScore)}</b> score
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      </Link>
  )

  const linksRow = (
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Attendance', to: '/fleet?tab=attendance', show: true },
          { label: 'Customer briefing', to: '/team/customers', show: canBriefing },
          { label: 'Days off', to: '/leave/flexible', show: true },
          { label: 'Calendars', to: '/calendar', show: true },
          { label: 'More in Hub', to: '/menu', show: true },
        ]
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.label} to={l.to} className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-white px-3.5 text-[13px] font-bold text-neutral-700">
              {l.label}
            </Link>
          ))}
      </div>
  )

  if (wide) {
    // Desktop: the people with their day bars take the wide column; what needs a decision sits beside them.
    return (
      <DesktopPage
        aside={
          <>
            {needsCard}
            {alertsCard}
            {reportCard}
            {linksRow}
          </>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile label="In the field" value={`${worked.length} / ${field.length}`} sub={count('leave') ? `${count('leave')} on leave` : undefined} />
          <SummaryTile label="Visiting now" value={String(count('visiting'))} sub={`${count('idle')} between visits`} />
          <SummaryTile label="Not clocked in" value={String(count('notin'))} tone={count('notin') ? 'text-status-danger' : undefined} />
          <SummaryTile label="This week" value={formatScore(weekScore)} sub={`${weekVisits} visits · ${weekOrdered} ordered`} />
        </div>
        {peopleCard}
      </DesktopPage>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1 md:max-w-3xl md:px-8">
      {summaryLine}
      {needsCard}
      {alertsCard}
      {peopleCard}
      {reportCard}
      {linksRow}
    </div>
  )
}

function SummaryTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-card">
      <p className="text-[12px] font-semibold text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-[26px] font-extrabold leading-8 ${tone ?? 'text-neutral-900'}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </div>
  )
}


type Filter = 'all' | 'visiting' | 'idle' | 'notin' | 'leave'
const FILTERS: [Filter, string, string][] = [
  ['all', 'All', ''],
  ['visiting', 'Visiting', 'bg-status-visiting'],
  ['idle', 'Idle', 'bg-earth-500'],
  ['notin', 'Not in', 'bg-status-danger'],
  ['leave', 'Leave', 'bg-neutral-400'],
]
const DOT: Record<Filter, string> = { all: '', visiting: 'bg-status-visiting', idle: 'bg-earth-500', notin: 'bg-status-danger', leave: 'bg-neutral-400' }
