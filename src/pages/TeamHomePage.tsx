import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarRange, CheckSquare, ChevronRight, MapPin, UserX, type LucideIcon } from 'lucide-react'
import { TeamPulseCard } from '@/features/fleet/TeamPulse'
import { DAY_BAR_LEGEND, daySegments } from '@/features/fleet/dayBar'
import { DayBar, DayBarSwatch } from '@/features/fleet/DayBar'
import { useFleet } from '@/features/fleet/useFleet'
import { flexService, type FlexTeamRow } from '@/features/flex/flexService'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove } from '@/features/nav/navConfig'
import { useCan } from '@/features/permissions/PermissionsContext'
import { displayName } from '@/lib/displayName'
import { days } from '@/features/flex/flex'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useFleetHistory } from '@/features/reports/useFleetHistory'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useLanguage } from '@/i18n/LanguageContext'
import { getPresetRange, todayDateString } from '@/lib/dateRange'
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
  const { language } = useLanguage()

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
  const weekRange = useMemo(() => getPresetRange('this_week'), [])
  const week = useFleetHistory(ids, weekRange)
  const { byKind } = useVisitOptions()
  const label = (id: string | null) => {
    if (!id) return ''
    for (const list of Object.values(byKind)) {
      const o = list.find((x) => x.id === id)
      if (o) return o.label.trim().toLowerCase()
    }
    return ''
  }
  const [filter, setFilter] = useState<Filter>('all')
  const now = Date.now()

  const statusOf = (s: (typeof field)[number]): Filter => (leave[s.member.id] && !s.attendance ? 'leave' : s.status === 'VISITING' ? 'visiting' : s.status === 'IDLING' ? 'idle' : 'notin')
  const worked = field.filter((s) => s.attendance)

  const weekVisits = week.visits.length
  const weekOrdered = week.visits.filter((v) => label(v.order_status_id) === 'ordered').length
  const msOf = (a: string, b: string | null) => Math.max(0, (b ? Date.parse(b) : now) - Date.parse(a))
  const weekWork = week.attendance.reduce((n, a) => n + msOf(a.clock_in_at, a.clock_out_at), 0)
  const weekVisitMs = week.visits.reduce((n, v) => n + msOf(v.checked_in_at, v.checked_out_at), 0)
  const weekEff = weekWork ? Math.round((weekVisitMs / weekWork) * 100) : 0

  const count = (k: Filter) => (k === 'all' ? field.length : field.filter((s) => statusOf(s) === k).length)
  const shown = field.filter((s) => filter === 'all' || statusOf(s) === filter)
  // One time range for every bar, so they line up under the ticks: half an hour before the shift to its end,
  // stretched for anyone who clocked in earlier or is still working later.
  const shiftStart = new Date(`${today}T${settings.workStartTime.slice(0, 5)}:00+07:00`).getTime()
  const shiftEnd = new Date(`${today}T${settings.workEndTime.slice(0, 5)}:00+07:00`).getTime()
  const clocked = field.filter((s) => s.attendance).map((s) => s.attendance!)
  const rangeFrom = Math.min(shiftStart - 30 * 60_000, ...clocked.map((a) => Date.parse(a.clock_in_at)))
  const rangeTo = Math.max(shiftEnd, ...clocked.map((a) => (a.clock_out_at ? Date.parse(a.clock_out_at) : now)))
  const tickAt = (ms: number) => ((ms - rangeFrom) / (rangeTo - rangeFrom)) * 100
  const noon = new Date(`${today}T12:00:00+07:00`).getTime()
  const ticks = [
    { at: shiftStart, label: settings.workStartTime.slice(0, 5) },
    ...(noon > shiftStart + 90 * 60_000 && noon < shiftEnd - 90 * 60_000 ? [{ at: noon, label: '12:00' }] : []),
    { at: shiftEnd, label: settings.workEndTime.slice(0, 5) },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1 md:max-w-3xl md:px-8">
      <p className="text-[14px] text-neutral-600">
        {field.length} {field.length === 1 ? 'person' : 'people'} · {worked.length} in the field{count('leave') ? ` · ${count('leave')} on leave` : ''}
      </p>

      <TeamPulseCard snapshots={field} />

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
          <div aria-hidden className="relative ml-12 mt-3 h-3.5 text-[10px] font-semibold text-neutral-500">
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
          const workMs = s.attendance ? msOf(s.attendance.clock_in_at, s.attendance.clock_out_at) : 0
          const visitMs = done.reduce((n, v) => n + msOf(v.checked_in_at, v.checked_out_at), 0)
          const eff = workMs ? Math.round((visitMs / workMs) * 100) : null
          const sub =
            st === 'visiting' && s.openVisit
              ? `On a visit · ${formatDuration(now - Date.parse(s.openVisit.checked_in_at), language)}`
              : st === 'idle'
                ? `Between visits${done.length ? ` · last ${formatTime(done[done.length - 1].checked_out_at ?? done[done.length - 1].checked_in_at)}` : ''}`
                : st === 'leave'
                  ? 'On leave today'
                  : s.attendance?.clock_out_at
                    ? `Clocked out ${formatTime(s.attendance.clock_out_at)}`
                    : 'Not clocked in'
          const segs =
            st === 'leave'
              ? []
              : daySegments({
                  clockIn: s.attendance ? Date.parse(s.attendance.clock_in_at) : null,
                  clockOut: s.attendance?.clock_out_at ? Date.parse(s.attendance.clock_out_at) : null,
                  visits: done.map((v) => [Date.parse(v.checked_in_at), v.checked_out_at ? Date.parse(v.checked_out_at) : null]),
                  shiftStart,
                  shiftEnd,
                  now,
                  flagAfterMin: settings.idleAlertThresholdMinutes,
                })
          const barLabel = s.attendance
            ? `Clocked in ${formatTime(s.attendance.clock_in_at)}, ${done.length} ${done.length === 1 ? 'visit' : 'visits'}, ${formatDuration(visitMs, language)} on visits`
            : `No clock-in since ${settings.workStartTime.slice(0, 5)}`
          return (
            <Link key={s.member.id} to={`/fleet?member=${s.member.id}`} className="flex items-start gap-3 border-t border-neutral-100 py-2.5 first-of-type:border-t-0 dark:border-neutral-800">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">
                {name.slice(0, 2).toUpperCase()}
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#232323] ${DOT[st]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-bold text-neutral-900">{name}</span>
                  <span className="shrink-0 text-xs font-bold text-neutral-900">{s.attendance ? `${done.length} ${done.length === 1 ? 'visit' : 'visits'}` : '—'}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-xs ${st === 'notin' ? 'font-semibold text-status-danger' : 'text-neutral-500'}`}>{sub}</span>
                  {eff != null && <span className={`shrink-0 text-xs font-bold ${eff >= 25 ? 'text-status-working' : 'text-status-warn'}`}>{eff}% effective</span>}
                </span>
                {segs.length > 0 && <DayBar segs={segs} from={rangeFrom} to={rangeTo} label={barLabel} className="mt-2.5" />}
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

      <Link to="/fleet" aria-label={`Open team report: this week, ${weekVisits} visits, ${weekOrdered} ordered, ${weekEff}% effective`} className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500">This week</span>
          <span className="block text-[15px] font-bold text-neutral-900">Team report</span>
          <span className="block truncate text-xs text-neutral-500">Visits, orders, effective time and attendance, by person</span>
          <span className="mt-1 flex gap-3 text-xs text-neutral-600">
            <span>
              <b className="text-neutral-900">{weekVisits}</b> visits
            </span>
            <span>
              <b className="text-neutral-900">{weekOrdered}</b> ordered
            </span>
            <span>
              <b className="text-neutral-900">{weekEff}%</b> eff.
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      </Link>

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
