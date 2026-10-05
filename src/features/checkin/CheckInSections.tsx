import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Building2, CalendarDays, Check, ChevronDown, ChevronRight, ListTodo, Loader2, MapPin, RefreshCw, Route, type LucideIcon } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import type { VisitRow } from '@/features/attendance/types'
import { clockBlock } from '@/features/permissions/clockRules'
import type { RequiredLocation } from '@/features/permissions/permissionsService'
import { locationService } from '@/features/location/locationService'
import { useLocations } from '@/features/locations/useLocations'
import { usePlan } from '@/features/plan/usePlan'
import type { PlanItem } from '@/features/plan/planService'
import { calendarService, type CalendarItem } from '@/features/calendar/calendarService'
import { hhmm, itemTitle, sortDay } from '@/features/calendar/calendar'
import { summaryService } from '@/features/attendanceSummary/summaryService'
import type { AttendanceDay } from '@/features/attendanceSummary/attendanceSummary'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { useProfile } from '@/features/auth/useProfile'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useLanguage } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'
import { distanceInMeters } from '@/lib/geo'
import { formatDuration, formatTime } from '@/lib/datetime'
import { todayDateString } from '@/lib/dateRange'

const CARD = 'rounded-2xl border border-neutral-100 bg-white shadow-card'
const SECTION = 'text-xs font-bold uppercase tracking-[0.06em] text-neutral-500'
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

type Loc =
  | { status: 'checking' }
  | { status: 'ok'; place: string | null; accuracy: number }
  | { status: 'low'; accuracy: number }
  | { status: 'outside'; nearest: string; distance: string; accuracy: number }
  | { status: 'error' }

/**
 * Before clock-in, inside the dark hero (canvas Polish › Check In, before
 * clock-in): where you are against the clock-in locations, the GPS
 * accuracy, and whether you're ready. Only a hint -- app.clock_in decides.
 */
export function HeroLocationCard({ required }: { required: RequiredLocation[] }) {
  const { t } = useLanguage()
  const settings = useAppSettings()
  const { locations } = useLocations()
  const [loc, setLoc] = useState<Loc>({ status: 'checking' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoc({ status: 'checking' })
    locationService
      .getCurrentPosition()
      .then((r) => {
        if (cancelled) return
        if (r.accuracy > settings.maxLocationAccuracyM) return setLoc({ status: 'low', accuracy: r.accuracy })
        const block = clockBlock(required, r)
        if (block) return setLoc({ status: 'outside', nearest: block.nearest, distance: block.distance, accuracy: r.accuracy })
        const places = required.length ? required : locations.filter((l) => l.active)
        const place = places.find((l) => distanceInMeters(r.latitude, r.longitude, l.latitude, l.longitude) <= l.radius_m)?.name ?? null
        setLoc({ status: 'ok', place, accuracy: r.accuracy })
      })
      .catch(() => !cancelled && setLoc({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [required, locations, settings.maxLocationAccuracyM, nonce])

  const gps = 'accuracy' in loc ? t('checkInFlow.gps', { n: Math.round(loc.accuracy) }) : ''
  const title =
    loc.status === 'ok'
      ? (loc.place ?? t('checkInFlow.locationFound'))
      : loc.status === 'outside'
        ? loc.nearest
        : loc.status === 'checking'
          ? t('checkInFlow.findingYou')
          : loc.status === 'low'
            ? t('checkInFlow.weakGps')
            : t('checkInFlow.locationOff')
  const sub =
    loc.status === 'ok'
      ? `${loc.place ? t('checkInFlow.youreInside') : t('checkInFlow.anywhereOk')} · ${gps}`
      : loc.status === 'outside'
        ? `${t('checkInFlow.awayFrom', { distance: loc.distance })} · ${gps}`
        : loc.status === 'low'
          ? `${gps} · ${t('checkInFlow.moveOutside')}`
          : loc.status === 'error'
            ? t('checkInFlow.turnOnLocation')
            : t('checkInFlow.checkingGps')
  const ready = loc.status === 'ok'

  return (
    <div className="relative mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-white/[.07] px-3 py-2.5">
      <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${ready ? 'bg-[rgba(23,203,73,.2)] text-[#74E092]' : 'bg-white/10'}`}>
        {loc.status === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Building2 className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className={`block truncate text-xs ${loc.status === 'outside' || loc.status === 'low' ? 'text-[#FFB257]' : 'text-white/60'}`}>{sub}</span>
      </span>
      {ready ? (
        <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-[rgba(23,203,73,.2)] px-2 text-[11px] font-bold text-[#74E092]">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
          {t('checkInFlow.ready')}
        </span>
      ) : (
        loc.status !== 'checking' && (
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-bold">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t('checkInFlow.refresh')}
          </button>
        )
      )}
    </div>
  )
}

/** Balances owed by the customers on today's plan, for "N customers owe money". */
function usePlanBalances(items: PlanItem[]): { name: string; amount: number }[] {
  const [rows, setRows] = useState<{ name: string; amount: number }[]>([])
  const ids = [...new Set(items.map((i) => i.customer_id))].sort().join(',')
  useEffect(() => {
    if (!ids) return setRows([])
    let cancelled = false
    supabase
      .from('customer_directory')
      .select('shop_name, balance_usd')
      .in('id', ids.split(','))
      .gt('balance_usd', 0)
      .then(({ data }) => {
        if (cancelled) return
        setRows(
          (data ?? [])
            .map((r) => ({ name: r.shop_name ?? '', amount: Number(r.balance_usd ?? 0) }))
            .filter((r) => r.amount > 0)
            .sort((a, b) => b.amount - a.amount)
        )
      })
    return () => {
      cancelled = true
    }
  }, [ids])
  return rows
}

function TodayRow({ icon: Icon, tone, title, sub, value, to }: { icon: LucideIcon; tone: string; title: string; sub: string; value: string; to: string }) {
  return (
    <Link to={to} className="flex min-h-[58px] items-center gap-3 border-t border-neutral-100 py-2 first:border-t-0">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${tone}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-neutral-900">{title}</span>
        <span className="block truncate text-xs text-neutral-500">{sub}</span>
      </span>
      <span className="shrink-0 text-lg font-extrabold text-neutral-900">{value}</span>
    </Link>
  )
}

/** Before clock-in: what today holds -- planned stops, appointments, tasks and who owes money. */
export function TodayCard({ canPlan }: { canPlan: boolean }) {
  const { t } = useLanguage()
  const { profile } = useProfile()
  const today = todayDateString()
  const { items } = usePlan(today)
  const balances = usePlanBalances(items)
  const [calendar, setCalendar] = useState<CalendarItem[]>([])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    calendarService
      .items(profile.id, today, today)
      .then((r) => !cancelled && setCalendar(sortDay(r.filter((i) => i.day === today && !i.done && i.kind !== 'holiday' && i.kind !== 'leave' && i.kind !== 'plan'))))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [profile, today])

  const planned = items.filter((i) => i.status === 'planned')
  const appts = calendar.filter((i) => i.kind === 'appt')
  const todos = calendar.filter((i) => i.kind !== 'appt')

  return (
    <section aria-label={t('checkInFlow.today')} className={`${CARD} px-3.5 pb-1`}>
      <div className="flex items-center justify-between pb-1 pt-3">
        <p className={SECTION}>{t('checkInFlow.today')}</p>
        {canPlan && (
          <Link to="/plan" className="text-[13px] font-bold text-brand-500">
            {t('checkInFlow.openPlan')}
          </Link>
        )}
      </div>
      {canPlan && planned.length > 0 && (
        <TodayRow
          icon={MapPin}
          tone="bg-brand-50 text-brand-500"
          title={t(planned.length === 1 ? 'checkInFlow.plannedStop' : 'checkInFlow.plannedStops', { n: planned.length })}
          sub={t('checkInFlow.firstStop', { name: planned[0].shop_name })}
          value={String(planned.length)}
          to="/plan"
        />
      )}
      {appts.length > 0 && (
        <TodayRow
          icon={CalendarDays}
          tone="bg-status-warn/10 text-status-warn"
          title={t(appts.length === 1 ? 'checkInFlow.appointment' : 'checkInFlow.appointments', { n: appts.length })}
          sub={`${itemTitle(appts[0])}${appts[0].at_time ? ` · ${hhmm(appts[0].at_time)}` : ''}`}
          value={String(appts.length)}
          to="/calendar"
        />
      )}
      {todos.length > 0 && (
        <TodayRow
          icon={ListTodo}
          tone="bg-status-visiting/10 text-status-visiting"
          title={t('checkInFlow.toDo', { n: todos.length })}
          sub={itemTitle(todos[0])}
          value={String(todos.length)}
          to="/calendar"
        />
      )}
      {balances.length > 0 && (
        <TodayRow
          icon={Banknote}
          tone="bg-status-danger/10 text-status-danger"
          title={t(balances.length === 1 ? 'checkInFlow.oweOne' : 'checkInFlow.owe', { n: balances.length })}
          sub={balances
            .slice(0, 2)
            .map((b) => `${b.name} ${money(b.amount)}`)
            .join(' · ')}
          value={String(balances.length)}
          to="/plan"
        />
      )}
      {planned.length === 0 && calendar.length === 0 && (
        <p className="border-t border-neutral-100 py-3 text-[13px] text-neutral-500">{canPlan ? t('checkInFlow.nothingPlanned') : t('checkInFlow.nothingToday')}</p>
      )}
    </section>
  )
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LEAVE_TAG: Record<string, string> = { annual: 'AL', sick: 'SL', unpaid: 'UL' }
const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(d)

/** Before clock-in: this week's attendance in the app's one calendar style (leave = grey cell, dot = what happened, today = ring). */
export function WeekStrip() {
  const { t } = useLanguage()
  const { profile } = useProfile()
  const [days, setDays] = useState<AttendanceDay[] | null>(null)
  const today = todayDateString()
  const t0 = new Date(`${today}T00:00:00Z`)
  const monday = new Date(t0.getTime() - ((t0.getUTCDay() + 6) % 7) * 86_400_000)
  const week = Array.from({ length: 7 }, (_, i) => isoDay(new Date(monday.getTime() + i * 86_400_000 + 12 * 3_600_000)))

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    summaryService
      .days(week[0], week[6])
      .then((r) => !cancelled && setDays(r.filter((d) => d.userId === profile.id)))
      .catch(() => !cancelled && setDays([]))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the week only changes with the day
  }, [profile, week[0]])

  const byDay = new Map((days ?? []).map((d) => [d.day, d]))
  const onTime = (days ?? []).filter((d) => d.status === 'present' && d.day < today).length
  const late = (days ?? []).filter((d) => d.status === 'late' && d.day < today).length
  const absent = (days ?? []).filter((d) => d.status === 'absent' && d.day < today).length

  return (
    <section aria-label={t('checkInFlow.thisWeek')} className={`${CARD} px-3.5 pb-3`}>
      <div className="flex items-center justify-between pb-2 pt-3">
        <p className={SECTION}>{t('checkInFlow.thisWeek')}</p>
        <Link to="/leave?tab=attendance" className="text-[13px] font-bold text-brand-500">
          {t('checkInFlow.attendance')}
        </Link>
      </div>
      <div className="grid grid-cols-7 text-center">
        {week.map((day, i) => {
          const d = byDay.get(day)
          const isToday = day === today
          const leave = d?.status === 'leave'
          const dot = d && day < today ? (d.status === 'present' ? 'bg-status-working' : d.status === 'late' ? 'bg-status-warn' : d.status === 'absent' ? 'bg-status-danger' : '') : ''
          return (
            <div key={day} className="flex flex-col items-center gap-1">
              <span className={`text-[11px] font-bold ${isToday ? 'text-brand-500' : 'text-neutral-500'}`}>{DOW[i]}</span>
              <span
                className={`flex h-[50px] w-full max-w-[44px] flex-col items-center justify-center gap-1 rounded-xl ${leave ? 'bg-neutral-100' : ''}`}
                title={d ? `${day}: ${d.status}` : day}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                    isToday ? 'font-bold text-brand-500 ring-2 ring-inset ring-brand-500' : d?.status === 'absent' ? 'font-medium text-status-danger' : 'font-medium text-neutral-900'
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {leave ? (
                  <span className="text-[9px] font-bold leading-none text-neutral-600">{LEAVE_TAG[d?.leaveType ?? ''] ?? 'L'}</span>
                ) : (
                  <span className={`h-1.5 w-1.5 rounded-full ${dot || 'bg-transparent'}`} />
                )}
              </span>
            </div>
          )
        })}
      </div>
      {days && week[0] < today && (
        <p className="mt-2 text-xs text-neutral-500">
          {[t('checkInFlow.onTimeN', { n: onTime }), late ? t('checkInFlow.lateN', { n: late }) : null, absent ? t('checkInFlow.absentN', { n: absent }) : null].filter(Boolean).join(' · ')}
        </p>
      )}
    </section>
  )
}

function stopTag(item: PlanItem, t: (k: string) => string): { label: string; tone: string } | null {
  if (item.status === 'done') return { label: t('checkInFlow.tagDone'), tone: 'text-status-working' }
  if (!item.last_visit_at) return { label: t('checkInFlow.tagNever'), tone: 'text-neutral-500' }
  const days = (Date.now() - new Date(item.last_visit_at).getTime()) / 86_400_000
  return days >= 30 ? { label: t('checkInFlow.tagDue'), tone: 'text-status-warn' } : null
}

/**
 * On shift: the next stop with its own Check in, the whole plan folded
 * underneath, or a "build plan" nudge when there's no plan yet.
 */
export function PlanSection({ onCheckIn, busy }: { onCheckIn: (stop: PlanItem) => void; busy: boolean }) {
  const { t } = useLanguage()
  const { items, loading } = usePlan(todayDateString())
  const [open, setOpen] = useState(false)
  if (loading && items.length === 0) return <div className="h-[92px] animate-pulse rounded-2xl bg-neutral-100" />

  if (items.length === 0) {
    return (
      <section aria-label={t('checkInFlow.todaysPlan')} className={`${CARD} flex items-center gap-3 p-3.5`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <Route className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('checkInFlow.todaysPlan')}</span>
          <span className="block text-[15px] font-bold text-neutral-900">{t('checkInFlow.noPlanYet')}</span>
          <span className="block text-xs text-neutral-500">{t('checkInFlow.addStops')}</span>
        </span>
        <Link to="/plan" className="flex h-9 shrink-0 items-center rounded-full bg-brand-500 px-3.5 text-[13px] font-bold text-white">
          {t('checkInFlow.buildPlan')}
        </Link>
      </section>
    )
  }

  const nextIndex = items.findIndex((i) => i.status === 'planned')
  const next = nextIndex >= 0 ? items[nextIndex] : null
  const done = items.filter((i) => i.status === 'done').length
  const nextTag = next ? stopTag(next, t) : null

  return (
    <>
      {next && (
        <section aria-label={t('checkInFlow.nextStop')} className={`${CARD} p-3.5`}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-base font-extrabold text-white">{nextIndex + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-neutral-500">
                {done === 0 ? t('checkInFlow.firstStopLabel') : t('checkInFlow.nextStop')}
                {next.appointment_at ? ` · ${formatTime(next.appointment_at)}` : ''}
              </span>
              <span className="block truncate text-[16px] font-extrabold text-neutral-900">{next.shop_name}</span>
              <span className="block truncate text-xs text-neutral-500">
                {next.address ?? '—'}
                {nextTag && (
                  <>
                    {' · '}
                    <span className={`font-bold ${nextTag.tone}`}>{nextTag.label}</span>
                  </>
                )}
              </span>
            </span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCheckIn(next)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-[15px] font-bold text-white disabled:opacity-50"
          >
            <MapPin className="h-[18px] w-[18px]" aria-hidden />
            {t('checkInFlow.checkInHere')}
          </button>
        </section>
      )}

      <section aria-label={t('checkInFlow.visitPlan', { n: items.length })} className={`${CARD} px-3.5`}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-[56px] w-full items-center gap-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-neutral-200 text-neutral-900">
            <Route className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-neutral-900">{t('checkInFlow.visitPlan', { n: items.length })}</span>
            <span className="block truncate text-xs text-neutral-500">{t('checkInFlow.doneOf', { done, n: items.length })}</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {open && (
          <div className="pb-2">
            {items.map((s, i) => {
              const tag = stopTag(s, t)
              const isDone = s.status === 'done'
              return (
                <div key={s.item_id} className={`flex min-h-[52px] items-center gap-3 border-t border-neutral-100 py-1.5 ${s.status === 'skipped' ? 'opacity-50' : ''}`}>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isDone ? 'bg-status-working text-white' : 'border-[1.5px] border-dashed border-brand-500 text-brand-500'
                    }`}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-neutral-900">{s.shop_name}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {s.appointment_at ? `${formatTime(s.appointment_at)} · ` : ''}
                      {s.address ?? '—'}
                      {tag && (
                        <>
                          {' · '}
                          <span className={`font-bold ${tag.tone}`}>{tag.label}</span>
                        </>
                      )}
                    </span>
                  </span>
                  {s.status === 'planned' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCheckIn(s)}
                      className="h-8 shrink-0 rounded-full border border-neutral-200 px-3 text-xs font-bold text-brand-500 disabled:opacity-50"
                    >
                      {t('checkInFlow.checkInShort')}
                    </button>
                  )}
                </div>
              )
            })}
            <Link to="/plan" className="flex h-11 items-center justify-center gap-1 border-t border-neutral-100 text-[13px] font-bold text-brand-500">
              {t('checkInFlow.editPlan')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </section>
    </>
  )
}

/**
 * On shift: today as a short timeline, newest first -- what's happening
 * now, each finished visit with its outcome, and the clock-in at the bottom.
 */
export function TodaysTimeline({
  visits,
  customerNames,
  clockInAt,
  clockInPlace,
  shiftStart,
  showJourney,
}: {
  visits: VisitRow[]
  customerNames: Record<string, string>
  clockInAt: string | null
  clockInPlace: string | null
  shiftStart: string
  showJourney: boolean
}) {
  const { t, tValue, language } = useLanguage()
  const journey = useJourneyContext()
  const { items } = usePlan(todayDateString())
  const { byKind } = useVisitOptions()
  const label = (id: string | null) => {
    if (!id) return null
    for (const list of Object.values(byKind)) {
      const o = list.find((x) => x.id === id)
      if (o) return tValue(`visitOption:${o.id}`, o.label)
    }
    return null
  }
  const done = visits.filter((v) => v.checked_out_at && !v.cancelled_at).sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))
  const next = items.find((i) => i.status === 'planned')
  const open = journey.openVisit
  const nowText = open
    ? t('checkInFlow.nowVisiting', { name: open.customer_id ? (customerNames[open.customer_id] ?? '…') : t('common.unassignedVisit') })
    : next
      ? t('checkInFlow.nowHeading', { name: next.shop_name })
      : clockInPlace
        ? t('checkInFlow.nowNear', { place: clockInPlace })
        : t('checkInFlow.nowNoStop')

  let clockNote = ''
  if (clockInAt) {
    const [h, m] = formatTime(clockInAt).split(':').map(Number)
    const [sh, sm] = shiftStart.split(':').map(Number)
    const diff = sh * 60 + sm - (h * 60 + m)
    clockNote = diff > 0 ? t('checkInFlow.beforeShift', { n: formatDuration(diff * 60_000, language) }) : diff < 0 ? t('checkInFlow.afterShift', { n: formatDuration(-diff * 60_000, language) }) : t('checkInFlow.onTheDot')
  }

  return (
    <section aria-label={t('checkIn.todaysVisits', { n: done.length })} className={`${CARD} px-3.5 pb-2`}>
      <div className="flex items-center justify-between pb-1 pt-3">
        <p className={SECTION}>{t('checkIn.todaysVisits', { n: done.length })}</p>
        {showJourney && (
          <Link to="/footprints" className="text-[13px] font-bold text-brand-500">
            {t('checkIn.fullJourney').replace(' ›', '')}
          </Link>
        )}
      </div>
      <ol className="relative">
        <TimelineRow time={formatTime(new Date().toISOString())} dot="bg-brand-500 ring-4 ring-brand-500/20" title={t('checkInFlow.now')} sub={nowText} first />
        {done.length === 0 && <li className="py-2 pl-[68px] text-[13px] text-neutral-500">{t('checkInFlow.noVisitsYetBody')}</li>}
        {done.map((v) => {
          const chips = [label(v.order_status_id), label(v.payment_status_id)].filter((x): x is string => !!x)
          return (
            <TimelineRow
              key={v.id}
              time={formatTime(v.checked_in_at)}
              dot="bg-status-visiting"
              title={v.customer_id ? (customerNames[v.customer_id] ?? t('common.loading')) : t('common.unassignedVisit')}
              sub={formatDuration(new Date(v.checked_out_at!).getTime() - new Date(v.checked_in_at).getTime(), language)}
              chips={chips}
              flagged={(v.flags?.length ?? 0) > 0 || v.out_of_range}
            />
          )
        })}
        {clockInAt && (
          <TimelineRow
            time={formatTime(clockInAt)}
            dot="bg-status-working"
            title={t('checkIn.clockedIn')}
            sub={[clockInPlace, clockNote].filter(Boolean).join(' · ')}
          />
        )}
      </ol>
    </section>
  )
}

function TimelineRow({ time, dot, title, sub, chips = [], flagged = false, first = false }: { time: string; dot: string; title: string; sub: string; chips?: string[]; flagged?: boolean; first?: boolean }) {
  const { t } = useLanguage()
  return (
    <li className={`relative flex gap-3 py-2.5 ${first ? '' : 'border-t border-neutral-100'}`}>
      <span className="w-11 shrink-0 pt-px text-right text-xs font-bold tabular-nums text-neutral-500">{time}</span>
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-neutral-900">{title}</span>
          {flagged && <span className="shrink-0 rounded-full bg-status-warn/10 px-1.5 py-px text-[10px] font-bold text-status-warn">{t('checkIn.flagged')}</span>}
        </span>
        {sub && <span className="block text-xs text-neutral-500">{sub}</span>}
        {chips.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-neutral-100 px-2 py-px text-[11px] font-bold text-neutral-700">
                {c}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  )
}
