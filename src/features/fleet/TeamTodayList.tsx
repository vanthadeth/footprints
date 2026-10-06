import { useState } from 'react'
import { ChevronDown, Footprints } from 'lucide-react'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { useLanguage } from '@/i18n/LanguageContext'
import { displayName } from '@/lib/displayName'
import { formatDuration, formatTime } from '@/lib/datetime'
import { FleetMemberDetail } from './FleetMemberDetail'
import { DayBar } from './DayBar'
import { atLocal, segText, segmentsFor } from './dayBar'
import { useAppSettings } from '@/hooks/useAppSettings'
import { todayDateString } from '@/lib/dateRange'
import type { FleetMemberSnapshot } from './types'
import { firstClockIn, lastClockOut, workedMs } from '@/features/attendance/sessions'

const DOT: Record<FleetMemberSnapshot['status'], string> = { VISITING: 'bg-status-visiting', IDLING: 'bg-earth-500', OFF: 'bg-neutral-400' }

/**
 * Team report › Dashboard › "Team today" (canvas Polish › Team report):
 * one card per person -- status, visits and clock-in at a glance; tap to
 * open what they're doing now, their numbers and today's visits with
 * outcomes, and a link to their footprints.
 */
export function TeamTodayList({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<FleetMemberSnapshot | null>(null)
  const customerNames = useCustomerNames(snapshots.flatMap((s) => s.visitsToday.map((v) => v.customer_id)))
  const { byKind } = useVisitOptions()
  const { t, tValue, language } = useLanguage()
  const settings = useAppSettings()
  const day = todayDateString()
  const shiftStart = atLocal(day, settings.workStartTime)
  const shiftEnd = atLocal(day, settings.workEndTime)
  const optionLabel = (id: string | null) => {
    if (!id) return null
    for (const list of Object.values(byKind)) {
      const o = list.find((x) => x.id === id)
      if (o) return tValue(`visitOption:${o.id}`, o.label)
    }
    return null
  }
  const now = Date.now()
  const sorted = [...snapshots].sort((a, b) => (a.status === b.status ? 0 : a.status === 'VISITING' ? -1 : b.status === 'VISITING' ? 1 : a.status === 'IDLING' ? -1 : 1))

  return (
    <section aria-label="Team today" className="space-y-2">
      <div className="flex items-baseline justify-between px-0.5">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Team today</p>
        <p className="text-xs text-neutral-500">Tap a name for details</p>
      </div>
      {sorted.map((s) => {
        const name = displayName(s.member.fullName, s.member.nickname)
        const done = s.visitsToday.filter((v) => !v.cancelled_at)
        const isOpen = open === s.member.id
        const workMs = workedMs(s.sessions, now)
        const firstIn = firstClockIn(s.sessions)
        const lastOut = lastClockOut(s.sessions)
        const visitMs = done.reduce((n, v) => n + ((v.checked_out_at ? Date.parse(v.checked_out_at) : now) - Date.parse(v.checked_in_at)), 0)
        const eff = workMs > 0 ? Math.round((visitMs / workMs) * 100) : null
        const last = done[done.length - 1]
        const nowTitle =
          s.status === 'VISITING' && s.openVisit
            ? `At ${s.openVisit.customer_id ? (customerNames[s.openVisit.customer_id] ?? '…') : t('common.unassignedVisit')}`
            : s.status === 'IDLING'
              ? 'Between visits'
              : lastOut
                ? `Clocked out ${formatTime(lastOut)}`
                : 'Not clocked in'
        const nowSub =
          s.status === 'VISITING' && s.openVisit
            ? `${formatDuration(now - Date.parse(s.openVisit.checked_in_at), language)} so far`
            : s.status === 'IDLING'
              ? last
                ? `No visit since ${formatTime(last.checked_out_at ?? last.checked_in_at)}`
                : `Clocked in ${formatTime(firstIn)}`
              : s.attendance
                ? `Worked ${formatDuration(workMs, language)}`
                : 'Shift started without a clock-in'
        return (
          <div key={s.member.id} className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            <button type="button" onClick={() => setOpen(isOpen ? null : s.member.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">
                {name.slice(0, 2).toUpperCase()}
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#232323] ${DOT[s.status]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-neutral-900">{name}</span>
                <span className={`block truncate text-xs ${!s.attendance ? 'font-semibold text-status-danger' : 'text-neutral-500'}`}>{nowTitle}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-extrabold text-neutral-900">{s.attendance ? `${done.length} ${done.length === 1 ? 'visit' : 'visits'}` : '—'}</span>
                <span className="block text-[11px] text-neutral-500">{firstIn ? `in ${formatTime(firstIn)}` : ''}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {isOpen && (
              <div className="border-t border-neutral-100 px-3.5 pb-3 pt-2.5 dark:border-neutral-800">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Now</p>
                <p className="text-sm font-bold text-neutral-900">{nowTitle}</p>
                <p className="text-xs text-neutral-500">{nowSub}</p>
                {s.attendance && (
                  <div className="mt-2.5 grid grid-cols-3 rounded-xl bg-neutral-50 px-1 py-2 text-center">
                    {[
                      ['On clock', formatDuration(workMs, language)],
                      ['Effective', eff != null ? `${eff}%` : '—'],
                      ['Visits', String(done.length)],
                    ].map(([l, v]) => (
                      <span key={l}>
                        <span className="block text-[11px] text-neutral-500">{l}</span>
                        <span className={`block text-sm font-extrabold ${l === 'Effective' && eff != null ? (eff >= 25 ? 'text-status-working' : 'text-status-warn') : 'text-neutral-900'}`}>{v}</span>
                      </span>
                    ))}
                  </div>
                )}
                {s.attendance &&
                  (() => {
                    const { segs, live, clockIn, clockOut } = segmentsFor({ attendance: s.sessions, visits: s.visitsToday, shiftStart, shiftEnd, now, flagAfterMin: settings.idleAlertThresholdMinutes })
                    if (clockIn == null) return null
                    const name = (g: (typeof segs)[number]) => (g.visit != null ? (live[g.visit]?.customer_id ? (customerNames[live[g.visit].customer_id!] ?? null) : null) : null)
                    return (
                      <div className="mt-3">
                        <DayBar segs={segs} from={clockIn} to={Math.max(shiftEnd, clockOut ?? now)} size="md" label={`Clocked in ${formatTime(firstIn)}${s.sessions.length > 1 ? ` (${s.sessions.length} sessions)` : ''}, ${live.length} ${live.length === 1 ? 'visit' : 'visits'}`} describe={(g) => segText(g, name(g))} />
                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>In {formatTime(firstIn)}</span>
                          <span>{lastOut ? `Out ${formatTime(lastOut)}` : settings.workEndTime.slice(0, 5)}</span>
                        </div>
                      </div>
                    )
                  })()}
                {done.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Visits today</p>
                    {done.map((v) => {
                      const chips = [optionLabel(v.order_status_id), optionLabel(v.payment_status_id), v.next_appointment ? 'Appointment' : null].filter((x): x is string => !!x)
                      return (
                        <div key={v.id} className="flex items-start gap-2.5 border-t border-neutral-100 py-2 first-of-type:border-t-0 dark:border-neutral-800">
                          <span className="w-10 shrink-0 pt-px text-xs font-bold tabular-nums text-neutral-500">{formatTime(v.checked_in_at)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold text-neutral-900">{v.customer_id ? (customerNames[v.customer_id] ?? '…') : t('common.unassignedVisit')}</span>
                            {chips.length > 0 ? (
                              <span className="mt-0.5 flex flex-wrap gap-1">
                                {chips.map((c) => (
                                  <span key={c} className="rounded-full bg-neutral-100 px-1.5 py-px text-[10.5px] font-bold text-neutral-700">
                                    {c}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              !v.checked_out_at && <span className="text-[11px] font-bold text-status-visiting">In progress</span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <button type="button" onClick={() => setDetail(s)} className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-[13px] font-bold text-brand-500">
                  <Footprints className="h-4 w-4" aria-hidden /> Footprints
                </button>
              </div>
            )}
          </div>
        )
      })}
      <FleetMemberDetail snapshot={detail} onClose={() => setDetail(null)} />
    </section>
  )
}
