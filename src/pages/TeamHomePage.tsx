import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarCheck, CalendarRange, CheckSquare, ChevronRight, MapPin, Table2, UserX, Calendar as CalendarIcon, type LucideIcon } from 'lucide-react'
import { useFleet } from '@/features/fleet/useFleet'
import { FleetStatusBadge } from '@/features/fleet/FleetStatusBadge'
import { flexService, type FlexTeamRow } from '@/features/flex/flexService'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove } from '@/features/nav/navConfig'
import { useCan } from '@/features/permissions/PermissionsContext'
import { displayName } from '@/lib/displayName'
import { days } from '@/features/flex/flex'

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
  const { group, ctx } = useRoleGroup()
  const pending = usePendingApprovals(canApprove(ctx))
  const canBriefing = useCan('customer_briefing')
  const [flex, setFlex] = useState<FlexTeamRow[]>([])

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
  const counts = {
    visiting: field.filter((s) => s.status === 'VISITING').length,
    idling: field.filter((s) => s.status === 'IDLING').length,
    off: field.filter((s) => s.status === 'OFF').length,
  }
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

  const links: { label: string; to: string; icon: LucideIcon; show: boolean }[] = [
    { label: 'Map', to: '/fleet?tab=map', icon: MapPin, show: true },
    { label: 'Attendance', to: '/fleet?tab=attendance', icon: CalendarCheck, show: true },
    { label: 'Reports', to: '/fleet?tab=reports', icon: BarChart3, show: true },
    { label: 'Briefing', to: '/team/customers', icon: Table2, show: canBriefing },
    { label: 'Days off', to: '/leave/flexible', icon: CalendarRange, show: true },
    { label: 'Calendars', to: '/calendar', icon: CalendarIcon, show: true },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1 md:max-w-3xl md:px-8">
      <p className="text-[14px] text-neutral-600">{group === 'admin' ? 'Everyone' : 'Your team'} · {field.length} in the field</p>

      <div className="rounded-2xl bg-white px-3.5 pb-1 pt-3 shadow-card">
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

      <Link to="/fleet" className="grid grid-cols-3 gap-2">
        <Tile label="Visiting" value={counts.visiting} dot="bg-status-visiting" />
        <Tile label="Idling" value={counts.idling} dot="bg-earth-500" />
        <Tile label="Off" value={counts.off} dot="bg-neutral-400" />
      </Link>

      <div className="rounded-2xl bg-white px-3.5 pb-1 pt-2.5 shadow-card">
        <div className="mb-0.5 flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">People</p>
          <Link to="/fleet" className="text-[13px] font-bold text-brand-600">
            All {field.length} ›
          </Link>
        </div>
        {loading && field.length === 0 && <div className="my-2 h-24 animate-pulse rounded-xl bg-neutral-100" />}
        {field.slice(0, 5).map((s, i) => (
          <Link key={s.member.id} to="/fleet" className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">
              {displayName(s.member.fullName, s.member.nickname).slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-neutral-900">{displayName(s.member.fullName, s.member.nickname)}</span>
              <span className="block truncate text-[12px] text-neutral-500">
                {s.visitsToday.length} visit{s.visitsToday.length === 1 ? '' : 's'} today{s.member.departmentName ? ` · ${s.member.departmentName}` : ''}
              </span>
            </span>
            <FleetStatusBadge status={s.status} />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.label} to={l.to} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-1 py-3 text-brand-600 shadow-card">
              <l.icon className="h-5 w-5" aria-hidden />
              <span className="text-[12px] font-bold text-neutral-600">{l.label}</span>
            </Link>
          ))}
      </div>

      <Link to="/menu" className="flex items-center justify-between rounded-2xl bg-white p-3.5 text-[14px] font-bold text-neutral-900 shadow-card">
        More in Hub
        <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
      </Link>
    </div>
  )
}

/** A calm status count, as on the canvas: a card with a coloured dot, not a solid colour block. */
function Tile({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <span className="rounded-2xl border border-neutral-100 bg-white px-3 py-3 shadow-card">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-500">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="mt-1 block text-[26px] font-extrabold leading-none text-neutral-900">{value}</span>
    </span>
  )
}
