import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, History, MapPin, Route } from 'lucide-react'
import { supabase } from '@footprints/shared/lib/supabase'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { usePlan } from '@/features/plan/usePlan'
import type { PlanItem } from '@/features/plan/planService'
import { calendarService, type CalendarItem } from '@/features/calendar/calendarService'
import { hhmm } from '@/features/calendar/calendar'
import { addDays } from '@/features/flex/flex'
import { dayMonth } from '@/features/customers/detail/dates'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { todayDateString } from '@/lib/dateRange'
import { formatTime } from '@footprints/shared/lib/datetime'
import { formatMn } from './formatMn'

const CARD = 'rounded-[20px] bg-white shadow-card'

interface Appt extends CalendarItem {
  area: string | null
}

/** Appointments still to visit: ones from the last month nobody ticked off, then today's, with each customer's area. */
function useAppointments(): Appt[] {
  const { profile } = useProfile()
  const today = todayDateString()
  const [items, setItems] = useState<CalendarItem[]>([])
  const [areas, setAreas] = useState<Record<string, string>>({})
  const userId = profile?.id ?? null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    calendarService
      .items(userId, addDays(today, -30), today)
      .then(async (r) => {
        const list = r.filter((i) => i.kind === 'appt' && !i.done && i.day <= today).sort((a, b) => a.day.localeCompare(b.day) || (a.at_time ?? '').localeCompare(b.at_time ?? ''))
        if (cancelled) return
        setItems(list)
        const ids = [...new Set(list.map((i) => i.customer_id).filter((x): x is string => !!x))]
        if (ids.length === 0) return
        const { data } = await supabase.from('customer_directory').select('id, district_name').in('id', ids)
        if (!cancelled && data) setAreas(Object.fromEntries(data.filter((c) => c.id && c.district_name).map((c) => [c.id as string, c.district_name as string])))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, today])

  return useMemo(() => items.map((i) => ({ ...i, area: i.customer_id ? (areas[i.customer_id] ?? null) : null })), [items, areas])
}

/**
 * The canvas's one list card: an Appointments tab (still to visit, missed ones first) and a Plan tab
 * (today's stops). `before` is the clock-in page, `on` the clocked-in one.
 */
export function ApptPlanCard({ variant, canPlan, onCheckIn, busy }: { variant: 'before' | 'on'; canPlan: boolean; onCheckIn?: (stop: PlanItem) => void; busy?: boolean }) {
  const { t, language } = useLanguage()
  const today = todayDateString()
  const allAppts = useAppointments()
  // Missed ones from earlier days show before the shift; once clocked in the list is today's.
  const appts = variant === 'before' ? allAppts : allAppts.filter((x) => x.day === today)
  const { items: plan } = usePlan(today)
  const [tab, setTab] = useState<'appt' | 'plan'>('appt')
  const done = plan.filter((p) => p.status === 'done').length
  const nextStopId = plan.find((p) => p.status === 'planned')?.item_id
  const now = Date.now()
  const diffOf = (a: Appt) => {
    if (a.day < today || !a.at_time) return null
    const [h, m] = a.at_time.split(':').map(Number)
    return new Date(new Date().setHours(h, m, 0, 0)).getTime() - now
  }
  const nextAppt = variant === 'before' ? appts.find((a) => a.day === today && (diffOf(a) ?? -1) > 0) : undefined
  const planCount = plan.length > 0 ? `${done}/${plan.length}` : '0'

  if (appts.length === 0 && plan.length === 0 && variant === 'on') return null

  return (
    <section aria-label={t('checkIn.summaryAppointments')} className={`${CARD} px-4 pb-1.5 pt-3.5`}>
      <div role="tablist" aria-label={t('checkIn.summaryAppointments')} className="mb-1.5 grid grid-cols-2 gap-1 rounded-[14px] bg-neutral-100 p-1">
        {(
          [
            ['appt', t('checkIn.summaryAppointments'), String(appts.length)],
            ...(canPlan ? ([['plan', t('checkIn.summaryPlan'), planCount]] as const) : []),
          ] as const
        ).map(([k, label, count]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex h-11 items-center justify-center gap-2 rounded-[11px] text-sm font-bold ${tab === k ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-600'}`}
          >
            {label}
            <span className={`rounded-full px-2 text-xs font-bold leading-[18px] ${tab === k ? 'bg-brand-500 text-white' : 'bg-neutral-200 text-neutral-600'}`}>{count}</span>
          </button>
        ))}
      </div>

      {tab === 'appt' ? (
        appts.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-neutral-500">{t('checkIn.noAppts')}</p>
        ) : (
          <ul>
            {appts.map((a) => {
              const overdue = a.day < today
              const diff = diffOf(a)
              const isNext = a === nextAppt
              const missed = !overdue && diff != null && diff < -30 * 60_000
              const warn = overdue || missed
              const sub = (isNext ? t('checkIn.apptNext', { area: a.area ?? '' }) : t('checkIn.apptRow', { area: a.area ?? '' })).replace(/ · $/, '')
              const chip = warn
                ? { text: t('checkIn.notVisitedChip'), cls: 'bg-status-warn/10 text-status-warn' }
                : diff == null
                  ? null
                  : Math.abs(diff) <= 30 * 60_000
                    ? { text: t('checkIn.nowChip'), cls: isNext ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-500' }
                    : { text: t('checkIn.inChip', { n: formatMn(diff, t, language) }), cls: isNext ? 'bg-brand-500 text-white' : variant === 'before' ? 'bg-brand-500/10 text-brand-500' : 'bg-neutral-100 text-neutral-600' }
              return (
                <li key={a.ref_id} className={isNext ? '-mx-2 rounded-xl bg-brand-500/10 px-2' : 'border-t border-neutral-100 first:border-t-0'}>
                  <Link to={a.customer_id ? `/customers/${a.customer_id}` : '/calendar'} className="flex items-center gap-2.5 py-3">
                    <span className="w-[46px] shrink-0 text-[12.5px] font-bold text-neutral-600">{overdue ? dayMonth(a.day, language) : a.at_time ? hhmm(a.at_time) : ''}</span>
                    <span className={`w-1 self-stretch rounded-sm ${warn ? 'bg-status-warn' : 'bg-brand-500'}`} aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="text-sm font-bold text-neutral-900">{a.customer_name ?? a.title}</b>
                      <span className="text-xs text-neutral-600">{sub}</span>
                    </span>
                    {chip && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      ) : plan.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-neutral-500">{t('checkIn.noPlanTab')}</p>
      ) : (
        <div>
          <div className="mb-1 flex gap-1" aria-hidden>
            {plan.map((p) => (
              <i key={p.item_id} className={`h-1.5 flex-1 rounded-[3px] ${p.status === 'done' ? 'bg-status-working' : 'bg-neutral-200'}`} />
            ))}
          </div>
          <ul>
            {plan.map((p) => {
              const isDone = p.status === 'done'
              const isNext = p.item_id === nextStopId
              const mins = p.checked_in_at && p.checked_out_at ? new Date(p.checked_out_at).getTime() - new Date(p.checked_in_at).getTime() : null
              const sub = isDone
                ? `${t('checkIn.doneRow')}${p.checked_in_at ? ` · ${formatTime(p.checked_in_at)}` : ''}${mins != null ? ` · ${formatMn(mins, t, language)}` : ''}`
                : isNext
                  ? `${t('checkIn.nextStopRow')}${p.address ? ` · ${p.address}` : ''}`
                  : (p.address ?? '')
              return (
                <li key={p.item_id} className="border-t border-neutral-100">
                  <button type="button" disabled={!onCheckIn || busy || isDone} onClick={() => onCheckIn?.(p)} className="flex w-full items-center gap-3 py-3 text-left disabled:cursor-default">
                    <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${isDone ? 'bg-status-working text-white' : isNext ? 'border-2 border-brand-500' : 'border-2 border-neutral-300'}`}>
                      {isDone ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : isNext ? <span className="h-2 w-2 rounded-full bg-brand-500" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="truncate text-[14.5px] font-bold text-neutral-900">{p.shop_name}</b>
                      <span className={`truncate text-[12.5px] ${isNext ? 'font-semibold text-brand-500' : 'text-neutral-600'}`}>{sub}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

/** The last three visits you finished, then a way into today's journey (canvas Check in, clocked in). */
export function RecentVisitsCard() {
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const { byKind } = useVisitOptions()
  const [rows, setRows] = useState<{ id: string; customer_id: string | null; checked_in_at: string; checked_out_at: string; visit_type_id: string | null; order_status_id: string | null }[]>([])
  const userId = profile?.id ?? null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('visits')
      .select('id, customer_id, checked_in_at, checked_out_at, visit_type_id, order_status_id')
      .eq('user_id', userId)
      .is('cancelled_at', null)
      .not('checked_out_at', 'is', null)
      .order('checked_in_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (!cancelled && data) setRows(data as typeof rows)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const names = useCustomerNames(rows.map((r) => r.customer_id))
  if (rows.length === 0) return null
  const label = (kind: 'visit_type' | 'order_status', id: string | null) => byKind[kind].find((o) => o.id === id)?.label ?? null
  const outcome = (id: string | null) => {
    const l = (label('order_status', id) ?? '').trim().toLowerCase()
    if (!l) return null
    if (l === 'ordered') return { text: t('checkIn.rvOrdered'), cls: 'text-brand-500' }
    if (l.startsWith('will')) return { text: t('checkIn.rvWillOrder'), cls: 'text-brand-500' }
    return { text: t('checkIn.rvNoOrder'), cls: 'text-neutral-600' }
  }
  return (
    <section aria-label={t('checkIn.recentVisits')} className={`${CARD} flex flex-col px-4 pb-4 pt-3.5`}>
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-neutral-900">
          <History className="h-[18px] w-[18px] text-neutral-600" aria-hidden />
          {t('checkIn.recentVisits')}
        </h2>
        <span className="text-xs font-semibold text-neutral-600">{t('checkIn.lastThree')}</span>
      </div>
      {rows.map((r) => {
        const day = dayMonth(r.checked_in_at, language)
        const [d, m] = language === 'km' ? day.split('/') : day.split(' ')
        const o = outcome(r.order_status_id)
        const type = label('visit_type', r.visit_type_id)
        const duration = formatMn(new Date(r.checked_out_at).getTime() - new Date(r.checked_in_at).getTime(), t, language)
        return (
          <Link key={r.id} to={r.customer_id ? `/customers/${r.customer_id}` : '/footprints'} className="flex min-h-14 items-center gap-3 border-t border-neutral-100 py-2 text-left">
            <span className="flex w-10 shrink-0 flex-col items-center leading-none">
              <b className="text-lg leading-[22px] tabular-nums text-neutral-900">{d}</b>
              <small className="text-[11px] font-bold uppercase text-neutral-600">{m}</small>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="truncate text-sm leading-[19px] text-neutral-900">{r.customer_id ? (names[r.customer_id] ?? '…') : t('common.unassignedVisit')}</b>
              <small className="text-xs font-semibold text-neutral-600">{type ? `${type} · ${duration}` : duration}</small>
            </span>
            {o && <span className={`shrink-0 text-[12.5px] font-bold ${o.cls}`}>{o.text}</span>}
            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-neutral-600" aria-hidden />
          </Link>
        )
      })}
      <Link to="/footprints" className="mt-2 flex h-12 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-brand-500 bg-brand-500/10 text-[14.5px] font-bold text-brand-500">
        <Route className="h-5 w-5" aria-hidden />
        {t('checkIn.showJourney')}
      </Link>
    </section>
  )
}

/** The pin used by the on-shift card's location line. */
export function LocationLine({ name, text }: { name: string; text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
      <MapPin className="h-4 w-4 text-status-working" aria-hidden />
      {name} · {text}
    </p>
  )
}
