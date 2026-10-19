import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { JourneyStats } from '@/features/attendance/journeyStats'
import { BAND_LABEL, formatScore } from '@/features/attendance/effectivenessScore'
import type { FirstVisit, FlagRules } from '@/features/attendance/flagRules'
import { INEFFECTIVE_VISIT_WEIGHT, NEAR_FIRST_VISIT_KM, ORDER_RECONCILE_DAYS } from '@/lib/config'
import { formatDuration, formatTime } from '@/lib/datetime'

type Tone = 'good' | 'warn' | 'danger' | 'neutral'
/** Text colours, drawn with currentColor: these have dark-theme overrides, a plain stroke colour wouldn't. */
const TONE: Record<Tone, string> = { good: 'text-status-working', warn: 'text-status-warn', danger: 'text-status-danger', neutral: 'text-brand-500' }

const card = 'rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card'

/** A circular progress ring with `children` (the figure) in the middle. `pct` is clamped to 0-100. */
function Ring({ pct, tone, size, stroke, children }: { pct: number | null; tone: Tone; size: number; stroke: number; children: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = (Math.min(100, Math.max(0, pct ?? 0)) / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-neutral-100 dark:stroke-neutral-600" />
        {filled > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="currentColor" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} className={TONE[tone]} />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

/** One part of the effectiveness score: a ring with its percentage, what it measures, and the figures. */
function Part({ label, vs, value, pct, tone, extra }: { label: string; vs: string; value: string; pct: number | null; tone: Tone; extra?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <Ring pct={pct} tone={tone} size={64} stroke={6}>
        <span className="text-[14px] font-extrabold text-neutral-900">{pct != null ? `${Math.round(pct)}%` : '—'}</span>
      </Ring>
      <p className="mt-2 text-[13px] font-bold text-neutral-900">{label}</p>
      <p className="text-[11px] text-neutral-500">{vs}</p>
      <p className="mt-0.5 max-w-full text-[12px] font-semibold text-neutral-900">{value}</p>
      {extra && <p className="max-w-full text-[11px] text-neutral-500">{extra}</p>}
    </div>
  )
}

function Warning({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-neutral-900">{title}</p>
        {children && <p className="text-xs text-neutral-500">{children}</p>}
      </div>
    </div>
  )
}

/**
 * The Summary tab of a day: how many visits were made and how many counted,
 * the effectiveness score broken into its parts (customers against the target,
 * counted time against working time, orders against visits), and warnings for
 * anything forgotten.
 */
export function DaySummary({
  stats,
  rules,
  firstVisit,
  paidVisits,
  appointments,
  language,
}: {
  stats: JourneyStats
  rules: FlagRules
  firstVisit: FirstVisit
  /** Visits with a payment collected, and with a next appointment. */
  paidVisits: number
  appointments: number
  language: string
}) {
  const fmt = (ms: number) => formatDuration(ms, language as Parameters<typeof formatDuration>[1])
  const day = stats.dayScores[0]
  // What the visits part counts: each effective visit in full, each ineffective one a quarter (so 3 + 5 × ¼ = 4.25 of 8 is 53%).
  const countedVisits = day ? Number((day.effectiveVisits + INEFFECTIVE_VISIT_WEIGHT * day.ineffectiveVisits).toFixed(2)) : 0
  const score = stats.score
  const band = day?.band ?? null
  const scoreTone: Tone = band === 'low' ? 'danger' : band === 'average' ? 'warn' : band ? 'good' : 'neutral'
  const notCredited = stats.totalVisits - stats.creditedVisits
  const outsideMs = Math.max(0, stats.totalPaidMs - stats.scheduledPaidMs)
  const orderPct = stats.totalVisits > 0 ? (stats.orderedVisits / stats.totalVisits) * 100 : null
  const deadline = rules.firstVisitDeadline.slice(0, 5)
  // An order the person marked counts for now; it is confirmed when the sale order shows up in the sync.
  const orderExtra = [stats.ordersSynced > 0 ? `${stats.ordersSynced} confirmed` : '', stats.ordersPending > 0 ? `${stats.ordersPending} pending` : ''].filter(Boolean).join(' · ') || undefined
  const hasWarnings =
    day?.lateDeduction || stats.forgottenCheckouts > 0 || stats.forgottenClockOuts > 0 || stats.ordersUnmatched > 0 || stats.flaggedGapMs > 0 || firstVisit.kind === 'late' || firstVisit.kind === 'none'

  return (
    <section aria-label="Day summary" className="flex flex-col gap-3">
      <div className={card}>
        <p className="text-[13px] font-semibold text-neutral-500">Visits</p>
        <p className="text-[30px] font-extrabold leading-9 text-neutral-900">{stats.totalVisits}</p>
        <p className="text-xs text-neutral-500">
          <b className="text-status-working">{stats.creditedVisits} effective</b>
          {' · '}
          <b className={notCredited > 0 ? 'text-status-warn' : 'text-neutral-900'}>{notCredited} not credited</b>
        </p>
        {notCredited > 0 && <p className="mt-1 text-[11px] text-neutral-500">A visit under {rules.shortVisitMin} min is not credited: it earns a quarter of an effective visit.</p>}
        {stats.uniqueCustomers > 0 && <p className="mt-1 text-[11px] text-neutral-500">{stats.uniqueCustomers} different customers (expected {stats.uniqueCustomerTarget}).</p>}
        {(paidVisits > 0 || appointments > 0) && (
          <div className="mt-2.5 space-y-1 border-t border-neutral-100 pt-2.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-neutral-500">Payment collected</span>
              <span className="font-bold text-neutral-900">{paidVisits}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-neutral-500">Next appointment</span>
              <span className="font-bold text-neutral-900">{appointments}</span>
            </div>
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-center gap-4">
          <Ring pct={score != null ? score * 10 : null} tone={scoreTone} size={96} stroke={9}>
            <span className="text-[26px] font-extrabold text-neutral-900">{formatScore(score)}</span>
          </Ring>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-neutral-900">Effectiveness</p>
            {band && <p className={`text-[13px] font-bold ${TONE[scoreTone]}`}>{BAND_LABEL[band]} · out of 10</p>}
            <p className="mt-0.5 text-xs text-neutral-500">The average of visits vs target and active hours vs working hours.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-4">
          <Part
            label="Visits"
            vs="vs target"
            value={`${countedVisits} / ${day?.visitTarget ?? rules.visitTarget}`}
            pct={day ? day.visitShare * 100 : null}
            tone={day && day.visitShare >= 1 ? 'good' : 'warn'}
            extra={day ? `${day.effectiveVisits} effective${day.ineffectiveVisits > 0 ? ` + ${day.ineffectiveVisits} × ¼` : ''}` : undefined}
          />
          <Part
            label="Active time"
            vs="vs working hours"
            value={`${fmt((day?.activeMs ?? 0) + (day?.travelBonusMs ?? 0))} / ${fmt(day?.workingMs ?? 0)}`}
            pct={day ? day.hoursShare * 100 : null}
            tone={day && day.hoursShare >= 0.5 ? 'good' : 'warn'}
            extra={day && day.travelBonusMs > 0 ? `includes ${fmt(day.travelBonusMs)} for ${Math.round(day.travelMeters / 1000)} km` : undefined}
          />
          <Part label="Ordered" vs="vs visits (not scored)" value={`${stats.orderedVisits} / ${stats.totalVisits}`} pct={orderPct} tone="neutral" extra={orderExtra} />
        </div>
        <p className="mt-3 text-[11px] text-neutral-500">
          Clocked in {fmt(stats.totalWorkingMs)}
          {outsideMs > 0 ? ` · ${fmt(outsideMs)} outside your hours isn't counted` : ''}. A visit marked ordered counts until the sale order syncs, up to {ORDER_RECONCILE_DAYS} days after the visit.
        </p>
      </div>

      <div className={card}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Warnings</p>
        {hasWarnings ? (
          <div className="space-y-2.5">
            {day?.lateDeduction && <Warning title="Late first visit, close by">First visit after {deadline} within {NEAR_FIRST_VISIT_KM} km of where you clocked in: score reduced by 10%.</Warning>}
            {stats.forgottenCheckouts > 0 && (
              <Warning title="Forgot to check out">
                {stats.forgottenCheckouts} {stats.forgottenCheckouts === 1 ? 'visit' : 'visits'} closed automatically, counted as {rules.forgottenCapMin} min.
              </Warning>
            )}
            {stats.forgottenClockOuts > 0 && <Warning title="Forgot to clock out">Clocked out automatically at the end of the day.</Warning>}
            {stats.ordersUnmatched > 0 && (
              <Warning title="Order not found">
                {stats.ordersUnmatched} {stats.ordersUnmatched === 1 ? 'visit' : 'visits'} marked ordered with no sale order after {ORDER_RECONCILE_DAYS} days, not counted.
              </Warning>
            )}
            {stats.flaggedGapMs > 0 && (
              <Warning title="Long idle gaps">
                {fmt(stats.flaggedGapMs)} over {stats.flaggedGaps} {stats.flaggedGaps === 1 ? 'gap' : 'gaps'}.
              </Warning>
            )}
            {firstVisit.kind === 'late' && <Warning title="Late first visit">First visit at {formatTime(new Date(firstVisit.at).toISOString())}, after {deadline}.</Warning>}
            {firstVisit.kind === 'none' && <Warning title="No visit yet">No customer visit by {deadline}.</Warning>}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-neutral-500">
            <CheckCircle2 className="h-4 w-4 text-status-working" aria-hidden /> Nothing forgotten, no long gaps.
          </p>
        )}
      </div>
    </section>
  )
}
