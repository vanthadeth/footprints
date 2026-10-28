import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Flag, CalendarDays } from 'lucide-react'
import { usePlan } from '@/features/plan/usePlan'
import type { PlanItem } from '@/features/plan/planService'
import { calendarService, type CalendarItem } from '@/features/calendar/calendarService'
import { hhmm, sortDay } from '@/features/calendar/calendar'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { formatDuration, formatTime } from '@footprints/shared/lib/datetime'
import { todayDateString } from '@/lib/dateRange'

const CARD = 'rounded-2xl border border-neutral-100 bg-white shadow-card'

/** A thin progress bar with a caption under it (the Visits and Sales tiles on the canvas). */
export function GoalTile({ label, value, unit, ratio, caption }: { label: string; value: string; unit?: string; ratio: number | null; caption?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-[22px] font-extrabold leading-7 text-neutral-900">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-neutral-500">{unit}</span>}
      </p>
      {ratio != null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }} />
        </div>
      )}
      {caption && <p className="mt-1 truncate text-xs text-neutral-500">{caption}</p>}
    </div>
  )
}

/** The share of worked time spent with customers, as the canvas's ring. */
export function Donut({ ratio }: { ratio: number }) {
  const r = 38
  const c = 2 * Math.PI * r
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`${pct}%`}>
      <circle cx="46" cy="46" r={r} fill="none" strokeWidth="9" className="stroke-neutral-200" />
      <circle cx="46" cy="46" r={r} fill="none" strokeWidth="9" strokeLinecap="butt" className="stroke-brand-500" strokeDasharray={`${c * (pct / 100)} ${c}`} transform="rotate(-90 46 46)" />
      <text x="46" y="52" textAnchor="middle" className="fill-neutral-900 text-[20px] font-extrabold">
        {pct}%
      </text>
    </svg>
  )
}

/** Today's plan as a list with a segmented progress bar (canvas Check in, clocked in). */
export function PlanListCard({ onCheckIn, busy }: { onCheckIn: (stop: PlanItem) => void; busy: boolean }) {
  const { t, language } = useLanguage()
  const { items } = usePlan(todayDateString())
  if (items.length === 0) return null
  const done = items.filter((i) => i.status === 'done').length
  const nextId = items.find((i) => i.status === 'planned')?.item_id
  return (
    <section aria-label={t('checkIn.summaryPlan')} className={`${CARD} px-4 pb-1 pt-3.5`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[17px] font-extrabold text-neutral-900">
          <Flag className="h-[18px] w-[18px] text-neutral-500" aria-hidden />
          {t('checkIn.summaryPlan')}
        </p>
        <p className="text-[13px] text-neutral-500">{t('checkIn.planDone', { done, total: items.length })}</p>
      </div>
      <div className="mt-2.5 flex gap-1" aria-hidden>
        {items.map((i) => (
          <span key={i.item_id} className={`h-1 flex-1 rounded-full ${i.status === 'done' ? 'bg-status-working' : 'bg-neutral-200'}`} />
        ))}
      </div>
      <ul className="mt-1">
        {items.map((i) => {
          const isDone = i.status === 'done'
          const isNext = i.item_id === nextId
          const mins = i.checked_in_at && i.checked_out_at ? new Date(i.checked_out_at).getTime() - new Date(i.checked_in_at).getTime() : null
          const sub = isDone
            ? `${t('checkIn.doneRow')}${i.checked_in_at ? ` · ${formatTime(i.checked_in_at)}` : ''}${mins != null ? ` · ${formatDuration(mins, language)}` : ''}`
            : isNext
              ? `${t('checkIn.nextStopRow')}${i.address ? ` · ${i.address}` : ''}`
              : (i.address ?? '')
          return (
            <li key={i.item_id} className="border-t border-neutral-100 first:border-t-0">
              <button
                type="button"
                disabled={busy || isDone}
                onClick={() => onCheckIn(i)}
                className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left disabled:cursor-default"
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
                    isDone ? 'bg-status-working text-white' : isNext ? 'border-2 border-brand-500' : 'border-2 border-neutral-300'
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : isNext ? <span className="h-2 w-2 rounded-full bg-brand-500" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-neutral-900">{i.shop_name}</span>
                  <span className={`block truncate text-xs ${isNext ? 'font-bold text-brand-500' : 'text-neutral-500'}`}>{sub}</span>
                </span>
                {!isDone && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Today's appointments with a "Now" or "In 4h 43m" chip (canvas Check in, clocked in). */
export function AppointmentsCard() {
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const today = todayDateString()
  const [appts, setAppts] = useState<CalendarItem[]>([])
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    calendarService
      .items(profile.id, today, today)
      .then((r) => !cancelled && setAppts(sortDay(r.filter((i) => i.day === today && !i.done && i.kind === 'appt'))))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [profile, today])
  if (appts.length === 0) return null
  const chip = (time: string | null) => {
    if (!time) return null
    const [h, m] = time.split(':').map(Number)
    const diff = new Date(new Date().setHours(h, m, 0, 0)).getTime() - Date.now()
    if (Math.abs(diff) <= 30 * 60_000) return { text: t('checkIn.nowChip'), cls: 'bg-brand-50 text-brand-700' }
    if (diff > 0) return { text: t('checkIn.inChip', { n: formatDuration(diff, language) }), cls: 'bg-neutral-100 text-neutral-600' }
    return null
  }
  return (
    <section aria-label={t('checkIn.summaryAppointments')} className={`${CARD} px-4 pb-1 pt-3.5`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[17px] font-extrabold text-neutral-900">
          <CalendarDays className="h-[18px] w-[18px] text-neutral-500" aria-hidden />
          {t('checkIn.summaryAppointments')}
        </p>
        <p className="text-[13px] text-neutral-500">
          {appts.length} {t('checkIn.today')}
        </p>
      </div>
      <ul className="mt-2">
        {appts.map((a) => {
          const c = chip(a.at_time)
          return (
            <li key={a.ref_id} className="flex items-center gap-3 border-t border-neutral-100 py-3 first:border-t-0">
              <span className="w-11 shrink-0 text-sm font-bold text-neutral-900">{a.at_time ? hhmm(a.at_time) : ''}</span>
              <span className="h-9 w-[3px] shrink-0 rounded-full bg-brand-500" aria-hidden />
              <Link to={a.customer_id ? `/customers/${a.customer_id}` : '/calendar'} className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-neutral-900">{a.customer_name ?? a.title}</span>
                <span className="block truncate text-xs text-neutral-500">{t('checkIn.apptSub')}</span>
              </Link>
              {c && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${c.cls}`}>{c.text}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
