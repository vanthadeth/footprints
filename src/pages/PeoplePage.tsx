import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarRange, ChevronRight, Scale, Users as UsersIcon, type LucideIcon } from 'lucide-react'
import { summaryService } from '@/features/attendanceSummary/summaryService'
import { teamKpis, totalsByPerson, formatRate, formatDays, type AttendanceDay } from '@/features/attendanceSummary/attendanceSummary'
import { cycleFor } from '@/features/attendanceSummary/attendanceCycle'
import { flexService, type FlexTeamRow } from '@/features/flex/flexService'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { localDay } from '@/features/customers/book'
import { displayName } from '@/lib/displayName'
import { days as flexDays, shortDate } from '@/features/flex/flex'

const TODAY_TILES: { key: AttendanceDay['status'] | 'lateAll'; label: string; tone: string }[] = [
  { key: 'present', label: 'Present', tone: 'bg-status-working/10 text-status-working dark:text-emerald-300' },
  { key: 'late', label: 'Late', tone: 'bg-status-warn/10 text-status-warn' },
  { key: 'absent', label: 'Absent', tone: 'bg-status-danger/10 text-status-danger' },
  { key: 'leave', label: 'Leave', tone: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100' },
  { key: 'dayoff', label: 'Day off', tone: 'bg-status-visiting/10 text-status-visiting dark:text-violet-300' },
]

/**
 * People (HR home tab): attendance today by status, who needs a look
 * (absent without leave, over the flexible allowance, starting flexible
 * days off), this attendance cycle's numbers and who's out today, with the
 * HR tools one tap away.
 */
export function PeoplePage() {
  const today = localDay(new Date().toISOString())
  const [todayRows, setTodayRows] = useState<AttendanceDay[] | null>(null)
  const [cycleRows, setCycleRows] = useState<AttendanceDay[]>([])
  const [cycle, setCycle] = useState<{ start: string; end: string } | null>(null)
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [flex, setFlex] = useState<FlexTeamRow[]>([])

  useEffect(() => {
    let cancelled = false
    summaryService
      .days(today, today)
      .then((r) => !cancelled && setTodayRows(r))
      .catch(() => !cancelled && setTodayRows([]))
    summaryService
      .settings()
      .then(async (s) => {
        const c = cycleFor(s.cycleCloseDay, today)
        const rows = await summaryService.days(c.start, today < c.end ? today : c.end)
        if (cancelled) return
        setCycle(c)
        setCycleRows(rows)
      })
      .catch(() => {})
    usersService
      .list()
      .then((u) => !cancelled && setPeople(u))
      .catch(() => {})
    flexService
      .team()
      .then((r) => !cancelled && setFlex(r))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [today])

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, displayName(p.fullName, p.nickname)]))
    return (id: string) => m.get(id) ?? 'Someone'
  }, [people])

  const count = (status: AttendanceDay['status']) => (todayRows ?? []).filter((r) => r.status === status || (status === 'present' && r.status === 'late')).length
  const kpis = useMemo(() => teamKpis(totalsByPerson(cycleRows).values()), [cycleRows])
  const absent = (todayRows ?? []).filter((r) => r.status === 'absent')
  const out = (todayRows ?? []).filter((r) => r.status === 'leave' || r.status === 'dayoff' || (r.leaveFraction > 0 && r.status !== 'holiday'))
  const lookRows = [
    ...absent.map((r) => ({ id: `a-${r.userId}`, name: nameOf(r.userId), sub: 'No clock-in, no leave today', tag: 'Absent', tone: 'bg-status-danger/10 text-status-danger', to: '/fleet?tab=attendance' })),
    ...flex.filter((f) => f.isFlexible && f.left < 0).map((f) => ({ id: `f-${f.userId}`, name: f.name, sub: `Flexible days off: ${flexDays(f.taken + f.planned)} of ${flexDays(f.allowance)} taken or planned`, tag: `Over by ${flexDays(-f.left)}`, tone: 'bg-status-visiting/10 text-status-visiting dark:text-violet-300', to: `/leave/days-off?user=${f.userId}` })),
    ...flex.filter((f) => !f.isFlexible && f.nextFrom).map((f) => ({ id: `n-${f.userId}`, name: f.name, sub: 'Starts flexible (travel) days off', tag: `Starts ${shortDate(f.nextFrom!)}`, tone: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800', to: '/leave/flexible' })),
  ]

  const links: { label: string; to: string; icon: LucideIcon }[] = [
    { label: 'Allowances', to: '/leave/allowances', icon: Scale },
    { label: 'Holidays', to: '/settings/holidays', icon: CalendarRange },
    { label: 'Days off', to: '/leave/flexible', icon: CalendarRange },
    { label: 'By cycle', to: '/fleet?tab=attendance&view=monthly', icon: CalendarCheck },
    { label: 'Weekly', to: '/fleet?tab=attendance&view=weekly', icon: CalendarCheck },
    { label: 'Team map', to: '/fleet', icon: UsersIcon },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1 md:max-w-3xl md:px-8">
      <p className="text-[14px] text-neutral-600">Everyone · {people.filter((p) => p.status === 'active').length || '…'} active people</p>

      <Link to="/fleet?tab=attendance" className="block rounded-2xl bg-white p-3.5 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Attendance today</p>
          <span className="text-[13px] font-bold text-brand-600">Daily ›</span>
        </div>
        {todayRows === null ? (
          <div className="mt-2 h-14 animate-pulse rounded-xl bg-neutral-100" />
        ) : (
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {TODAY_TILES.map((t) => (
              <span key={t.key} className={`rounded-xl px-1 py-2 text-center ${t.tone}`}>
                <span className="block text-[20px] font-extrabold">{count(t.key as AttendanceDay['status'])}</span>
                <span className="block text-[10.5px] font-bold text-neutral-600">{t.label}</span>
              </span>
            ))}
          </div>
        )}
      </Link>

      <div className="rounded-2xl bg-white px-3.5 pb-1 pt-3 shadow-card">
        <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Needs a look · {lookRows.length}</p>
        {lookRows.length === 0 && <p className="py-3 text-[13.5px] text-neutral-500">Nothing needs a look right now.</p>}
        {lookRows.map((r, i) => (
          <Link key={r.id} to={r.to} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{r.name.slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-neutral-900">{r.name}</span>
              <span className="block truncate text-[12px] text-neutral-500">{r.sub}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${r.tone}`}>{r.tag}</span>
          </Link>
        ))}
      </div>

      <Link to="/fleet?tab=attendance&view=monthly" className="block rounded-2xl bg-white p-3.5 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">This cycle{cycle ? ` · ${shortDate(cycle.start)} – ${shortDate(cycle.end)}` : ''}</p>
          <span className="text-[13px] font-bold text-brand-600">By person ›</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <Stat label="Attendance rate" value={formatRate(kpis.rate)} tone="text-status-working dark:text-emerald-300" />
          <Stat label="Late arrivals" value={String(kpis.late)} tone="text-status-warn" />
          <Stat label="Absent days" value={String(kpis.absent)} tone="text-status-danger" />
          <Stat label="Leave & days off" value={formatDays(kpis.leaveDays)} tone="text-status-visiting dark:text-violet-300" />
        </div>
      </Link>

      <div className="rounded-2xl bg-white px-3.5 pb-1 pt-2.5 shadow-card">
        <div className="mb-0.5 flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Out today · {out.length}</p>
          <Link to="/approvals" className="text-[13px] font-bold text-brand-600">
            Approvals ›
          </Link>
        </div>
        {out.length === 0 && <p className="py-3 text-[13.5px] text-neutral-500">Everyone’s in today.</p>}
        {out.map((r, i) => (
          <div key={r.userId} className={`flex items-center justify-between gap-3 py-2.5 text-[14px] ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="truncate font-semibold text-neutral-900">{nameOf(r.userId)}</span>
            <span className="shrink-0 text-[12.5px] font-bold text-status-visiting dark:text-violet-300">
              {r.status === 'dayoff' ? 'Day off (no clock-in)' : r.leaveType === 'flex' ? 'Flexible day off' : `${r.leaveType ? r.leaveType[0].toUpperCase() + r.leaveType.slice(1) : ''} leave${r.leaveFraction < 1 ? ' · half day' : ''}`}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {links.map((l) => (
          <Link key={l.label} to={l.to} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-1 py-3 text-status-visiting shadow-card dark:text-violet-300">
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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span>
      <span className={`block text-[20px] font-extrabold ${tone}`}>{value}</span>
      <span className="block text-[12px] text-neutral-500">{label}</span>
    </span>
  )
}
