import { useState } from 'react'
import { ChevronLeft, ChevronRight, Footprints as FootprintsIcon, Map as MapIcon } from 'lucide-react'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { EmptyState } from '@/components/EmptyState'
import { FlagBadge } from '@/components/FlagBadge'
import { useJourneyHistory, type DayJourney } from '@/features/attendance/useJourneyHistory'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { JourneyMap } from '@/features/attendance/JourneyMap'
import { DatePickerButton } from '@/features/attendance/DatePickerButton'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useLanguage } from '@/i18n/LanguageContext'
import { formatDuration, formatLongDate, formatTime } from '@/lib/datetime'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { distanceInMeters, formatDistance } from '@/lib/geo'

const LEAVE_TYPE_LABEL: Record<string, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', flex: 'Day Off' }

const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Straight-line route through the day: clock-ins, each visit's check-in point, clock-outs, in time order. */
function routeMeters(day: DayJourney): number {
  const pts: { t: string; lat: number; lng: number }[] = []
  for (const a of day.attendance) {
    pts.push({ t: a.clock_in_at, lat: a.clock_in_latitude, lng: a.clock_in_longitude })
    if (a.clock_out_at && a.clock_out_latitude != null && a.clock_out_longitude != null) pts.push({ t: a.clock_out_at, lat: a.clock_out_latitude, lng: a.clock_out_longitude })
  }
  for (const v of day.visits) if (!v.cancelled_at && v.in_latitude != null && v.in_longitude != null) pts.push({ t: v.checked_in_at, lat: v.in_latitude, lng: v.in_longitude })
  pts.sort((a, b) => a.t.localeCompare(b.t))
  let m = 0
  for (let i = 1; i < pts.length; i++) m += distanceInMeters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng)
  return m
}

/**
 * Day-by-day journey for one person, laid out like the design canvas
 * (Polish › Journey): a day switcher, then Summary (effectiveness, visit
 * outcomes, the day as a bar) or Footprints (route map and the timeline of
 * clock-ins, gaps and visit cards). Used for the signed-in user's own
 * Footprints (`interactive`, editable records) and read-only from Team.
 */
export function JourneyHistoryReport({ userId, interactive, subtitle }: { userId: string | null; interactive: boolean; subtitle?: string }) {
  const { t, language } = useLanguage()
  const [selectedDate, setSelectedDate] = useState(() => todayDateString())
  const [tab, setTab] = useState<'summary' | 'footprints'>('footprints')
  const [mapOpen, setMapOpen] = useState(false)
  const range = getCustomRange(selectedDate, selectedDate)
  const { days, allVisits, loading, error, refresh } = useJourneyHistory(userId, range)
  const customerNames = useCustomerNames(allVisits.map((v) => v.customer_id))
  const today = todayDateString()

  const day = days[0] ?? null
  const leaveType = useApprovedLeaveOnDate(userId ? [userId] : [], selectedDate)[userId ?? '']
  const stats = computeJourneyStats(day ? [day] : [])
  const effectiveness = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0
  const flags = [...new Set((day?.visits ?? []).flatMap((v) => v.flags ?? []))]
  const liveVisits = (day?.visits ?? []).filter((v) => !v.cancelled_at)
  const ordered = liveVisits.filter((v) => (v.order_amount_usd ?? 0) > 0).length
  const paid = liveVisits.filter((v) => (v.collected_usd ?? 0) > 0).length
  const appts = liveVisits.filter((v) => v.next_appointment).length
  const dayLabel = selectedDate === today ? t('common.today') : selectedDate === shiftDate(today, -1) ? t('common.yesterday') : null

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl">
      <div className="flex flex-col gap-3.5 px-4 pt-1.5 md:px-8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
            aria-label={t('footprints.prevDay')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-100 bg-white text-neutral-900"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[17px] font-bold text-neutral-900">{dayLabel ?? formatLongDate(`${selectedDate}T12:00:00Z`, undefined, language)}</p>
            <p className="truncate text-xs text-neutral-500">{dayLabel ? formatLongDate(`${selectedDate}T12:00:00Z`, undefined, language) : (subtitle ?? t('footprints.subtitle'))}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
            disabled={selectedDate >= today}
            aria-label={t('footprints.nextDay')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-100 bg-white text-neutral-900 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <DatePickerButton selected={selectedDate} onChange={setSelectedDate} />
        </div>

        <div role="tablist" aria-label="Journey view" className="flex gap-0.5 rounded-xl bg-neutral-100 p-[3px]">
          {(['summary', 'footprints'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`h-9 flex-1 rounded-[9px] text-[13px] ${tab === k ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}
            >
              {k === 'summary' ? t('footprints.summaryTab') : t('footprints.footprintsTab')}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : !day ? (
          leaveType ? (
            <EmptyState icon={FootprintsIcon} title={leaveType === 'flex' ? 'On a day off' : t('footprints.onLeaveTitle', { type: LEAVE_TYPE_LABEL[leaveType] })} />
          ) : (
            <EmptyState icon={FootprintsIcon} title={t('footprints.emptyTitle')} body={t('footprints.emptyBody')} />
          )
        ) : tab === 'summary' ? (
          <section aria-label="Day summary" className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
                <p className="text-[13px] font-semibold text-neutral-500">{t('footprints.effective')}</p>
                <p className="text-[30px] font-extrabold leading-9 text-neutral-900">{stats.totalWorkingMs > 0 ? `${effectiveness}%` : '—'}</p>
                <p className="text-[11px] text-neutral-500">{t('footprints.effectiveSub')}</p>
                <div className="mt-2.5 space-y-1 border-t border-neutral-100 pt-2.5 text-xs">
                  <Line label={t('footprints.clockedInFor')} value={formatDuration(stats.totalWorkingMs, language)} />
                  <Line label={t('checkIn.statActive')} value={formatDuration(stats.totalVisitingMs, language)} tone="text-brand-500" />
                  <Line label={t('footprints.gaps')} value={formatDuration(stats.totalGapMs, language)} />
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
                <p className="text-[13px] font-semibold text-neutral-500">{t('nav.visits')}</p>
                <p className="text-[30px] font-extrabold leading-9 text-neutral-900">{stats.totalVisits}</p>
                <p className="text-[11px] text-neutral-500">
                  {stats.unassignedVisits ? t('footprints.unassignedSub', { n: String(stats.unassignedVisits) }) : t('footprints.visitsSub')}
                </p>
                <div className="mt-2.5 space-y-1 border-t border-neutral-100 pt-2.5 text-xs">
                  <Line label={t('footprints.ordered')} value={String(ordered)} />
                  <Line label={t('footprints.payment')} value={String(paid)} />
                  <Line label={t('footprints.appt')} value={String(appts)} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('footprints.yourDay')}</p>
                <span className="text-[11px] text-neutral-500">{t('footprints.dayBarLegend')}</span>
              </div>
              <DayStrip day={day} />
              {flags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {flags.map((f) => (
                    <FlagBadge key={f} flag={f} />
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            <button type="button" onClick={() => setMapOpen(true)} className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 text-left shadow-card">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                <MapIcon className="h-[22px] w-[22px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-neutral-900">{t('footprints.viewMap')}</span>
                <span className="block text-xs text-neutral-500">{t('footprints.routeLine', { km: formatDistance(routeMeters(day)), n: stats.totalVisits })}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
            </button>

            <section aria-label={t('footprints.timeline')} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-card">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('footprints.timeline')}</p>
                <p className="text-xs text-neutral-500">
                  {formatTime(day.attendance[0]?.clock_in_at ?? null)} – {day.attendance.every((a) => a.clock_out_at) ? formatTime(day.attendance[day.attendance.length - 1].clock_out_at) : t('journey.now')}
                </p>
              </div>
              <JourneyTimeline attendance={day.attendance} visits={day.visits} customerNames={customerNames} interactive={interactive} onVisitChanged={refresh} />
            </section>
          </>
        )}
      </div>

      <FullScreenSheet open={mapOpen} onClose={() => setMapOpen(false)} label={t('footprints.journeyMapLabel')}>
        {day && <JourneyMap visits={day.visits} attendance={day.attendance} customerNames={customerNames} height="100dvh" rounded={false} />}
      </FullScreenSheet>
    </div>
  )
}

function Line({ label, value, tone = 'text-neutral-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-bold ${tone}`}>{value}</span>
    </div>
  )
}

/** First clock-in to last clock-out (or now) with hour ticks: clocked-in time grey, visits blue. */
function DayStrip({ day }: { day: DayJourney }) {
  const now = Date.now()
  const ins = day.attendance.map((a) => new Date(a.clock_in_at).getTime())
  const outs = day.attendance.map((a) => (a.clock_out_at ? new Date(a.clock_out_at).getTime() : now))
  const start = Math.min(...ins)
  const end = Math.max(...outs, start + 60 * 60_000)
  const span = end - start
  const pct = (ms: number) => `${(((ms - start) / span) * 100).toFixed(2)}%`
  const w = (a: number, b: number) => `max(2px, ${(((b - a) / span) * 100).toFixed(2)}%)`
  const hours: number[] = []
  for (let h = Math.ceil(start / 3_600_000) * 3_600_000; h < end; h += 3_600_000) hours.push(h)
  const step = Math.ceil(hours.length / 6)
  return (
    <div className="mt-3">
      <div className="relative h-4">
        {hours
          .filter((_, i) => i % step === 0)
          .map((h) => (
            <span key={h} className="absolute -translate-x-1/2 text-[10px] font-semibold text-neutral-500" style={{ left: pct(h) }}>
              {formatTime(new Date(h).toISOString())}
            </span>
          ))}
      </div>
      <div role="img" aria-label={`${day.visits.length} visits`} className="relative mt-1 h-6 overflow-hidden rounded-md bg-neutral-100">
        {day.attendance.map((a, i) => (
          <span key={a.id} className="absolute inset-y-0 bg-neutral-300 dark:bg-neutral-600" style={{ left: pct(ins[i]), width: w(ins[i], outs[i]) }} />
        ))}
        {day.visits
          .filter((v) => !v.cancelled_at)
          .map((v) => {
            const a = new Date(v.checked_in_at).getTime()
            const b = v.checked_out_at ? new Date(v.checked_out_at).getTime() : now
            return <span key={v.id} className="absolute inset-y-0 rounded-[3px] bg-brand-500" style={{ left: pct(a), width: w(a, b) }} title={formatTime(v.checked_in_at)} />
          })}
      </div>
    </div>
  )
}
