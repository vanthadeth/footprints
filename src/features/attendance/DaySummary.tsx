import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { JourneyStats } from '@/features/attendance/journeyStats'
import { GOOD_EFFECTIVENESS, effectivenessPercent } from '@/features/attendance/efficiency'
import type { FirstVisit, FlagRules } from '@/features/attendance/flagRules'
import { formatDuration, formatTime } from '@/lib/datetime'

type Tone = 'good' | 'warn' | 'neutral'
const BAR: Record<Tone, string> = { good: 'bg-status-working', warn: 'bg-status-warn', neutral: 'bg-brand-500' }

const card = 'rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card'

/** One line of the effectiveness breakdown: what it is, the figures, and a bar. */
function Meter({ label, value, pct, tone, note }: { label: string; value: string; pct: number | null; tone: Tone; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-neutral-900">{label}</span>
        <span className="text-[13px] font-bold text-neutral-900">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
      </div>
      {note && <p className="mt-1 text-[11px] text-neutral-500">{note}</p>}
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
  const score = effectivenessPercent(stats.creditedVisitMs, stats.scheduledPaidMs)
  const notCredited = stats.totalVisits - stats.creditedVisits
  const outsideMs = Math.max(0, stats.totalPaidMs - stats.scheduledPaidMs)
  const customerPct = stats.uniqueCustomerTarget > 0 ? (stats.uniqueCustomers / stats.uniqueCustomerTarget) * 100 : null
  const orderPct = stats.totalVisits > 0 ? (stats.orderedVisits / stats.totalVisits) * 100 : null
  const deadline = rules.firstVisitDeadline.slice(0, 5)
  const hasWarnings =
    stats.forgottenCheckouts > 0 || stats.forgottenClockOuts > 0 || stats.flaggedGapMs > 0 || firstVisit.kind === 'late' || firstVisit.kind === 'none'

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
        {notCredited > 0 && <p className="mt-1 text-[11px] text-neutral-500">A visit under {rules.shortVisitMin} min counts nothing.</p>}
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
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold text-neutral-500">Effectiveness</p>
          <p className="text-[30px] font-extrabold leading-9 text-neutral-900">{score != null ? `${score}%` : '—'}</p>
        </div>
        <p className="text-[11px] text-neutral-500">Counted visit time ÷ working time in your hours</p>
        <div className="mt-3 space-y-3.5 border-t border-neutral-100 pt-3">
          <Meter
            label="Customers vs target"
            value={`${stats.uniqueCustomers} / ${stats.uniqueCustomerTarget}`}
            pct={customerPct}
            tone={stats.uniqueCustomers >= stats.uniqueCustomerTarget ? 'good' : 'warn'}
            note="Different customers visited; a repeat visit counts once."
          />
          <Meter
            label="Active time vs working hours"
            value={`${fmt(stats.creditedVisitMs)} / ${fmt(stats.scheduledPaidMs)}`}
            pct={score}
            tone={score != null && score >= GOOD_EFFECTIVENESS * 100 ? 'good' : 'warn'}
            note={`Clocked in ${fmt(stats.totalWorkingMs)}${outsideMs > 0 ? ` · ${fmt(outsideMs)} outside your hours isn't counted` : ''}`}
          />
          <Meter label="Ordered vs visits" value={`${stats.orderedVisits} / ${stats.totalVisits}`} pct={orderPct} tone="neutral" />
        </div>
      </div>

      <div className={card}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Warnings</p>
        {hasWarnings ? (
          <div className="space-y-2.5">
            {stats.forgottenCheckouts > 0 && (
              <Warning title="Forgot to check out">
                {stats.forgottenCheckouts} {stats.forgottenCheckouts === 1 ? 'visit' : 'visits'} closed automatically, counted as {rules.forgottenCapMin} min.
              </Warning>
            )}
            {stats.forgottenClockOuts > 0 && <Warning title="Forgot to clock out">Clocked out automatically at the end of the day.</Warning>}
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
