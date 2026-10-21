import { useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import type { JourneyStats } from '@/features/attendance/journeyStats'
import { BAND_LABEL, BAND_STYLE, formatScore, scoreBand, type ScoreBand } from '@/features/attendance/effectivenessScore'
import type { FirstVisit, FlagRules } from '@/features/attendance/flagRules'
import { formatDistance } from '@/lib/geo'
import { INEFFECTIVE_VISIT_WEIGHT, ORDER_RECONCILE_DAYS, SCORE_GOAL_ACTIVE, SCORE_GOAL_ORDERS, SCORE_GOAL_VISITS } from '@/lib/config'
import { formatDuration, formatTime } from '@/lib/datetime'

const card = 'rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card'

/** A part's share of its goal on the score's own 0-10 scale, so it takes the same band and colour as the score. */
const partScore = (share: number) => Math.min(10, Math.max(0, share * 10))

/** The bands as a scale from 0 to 10, with a marker at the score: poor 0-5, average 5-7, good 7-9, excellent 9-10. */
const SCALE: { band: ScoreBand; from: number; to: number }[] = [
  { band: 'poor', from: 0, to: 5 },
  { band: 'average', from: 5, to: 7 },
  { band: 'good', from: 7, to: 9 },
  { band: 'excellent', from: 9, to: 10 },
]

function ScoreScale({ score, band, labels = true, className = 'mt-4' }: { score: number | null; band: ScoreBand | null; labels?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="relative">
        <div className="flex gap-[3px]">
          {SCALE.map((seg) => (
            <div key={seg.band} className={`h-2 rounded-full ${BAND_STYLE[seg.band].fill} ${seg.band === band ? '' : 'opacity-25'}`} style={{ width: `${(seg.to - seg.from) * 10}%` }} />
          ))}
        </div>
        {score != null && (
          <span
            aria-hidden
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-neutral-900 shadow"
            style={{ left: `${Math.min(100, Math.max(0, score * 10))}%` }}
          />
        )}
      </div>
      {labels && (
        <div className="relative mt-1.5 h-3 text-[10px] font-semibold text-neutral-500">
          {[0, 5, 7, 9, 10].map((n) => (
            <span key={n} className="absolute -translate-x-1/2" style={{ left: `${n * 10}%` }}>
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** One contributor to the score: what it is, how far to its goal as a bar, and the figures behind it. */
function Contributor({ label, share, figure, detail }: { label: string; share: number | null; figure: string; detail: string }) {
  const value = share != null ? partScore(share) : null
  const band = value != null ? scoreBand(value) : null
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-bold text-neutral-900">{label}</span>
        <span className={`text-[13px] font-extrabold ${band ? BAND_STYLE[band].text : 'text-neutral-500'}`}>{share != null ? `${Math.round(share * 100)}%` : '—'}</span>
      </div>
      <ScoreScale score={value} band={band} labels={false} className="mt-2" />
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[12px]">
        <span className="font-semibold text-neutral-900">{figure}</span>
        <span className="text-right text-neutral-500">{detail}</span>
      </div>
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
  const [infoOpen, setInfoOpen] = useState(false)
  const visitTarget = day?.visitTarget ?? rules.visitTarget
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const notCredited = stats.totalVisits - stats.creditedVisits
  const outsideMs = Math.max(0, stats.totalPaidMs - stats.scheduledPaidMs)
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
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-neutral-500">Effectiveness</p>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="How the effectiveness score works"
            className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 tap-target"
          >
            <Info className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        <div className="mt-0.5 flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[44px] font-extrabold leading-none tracking-tight text-neutral-900">{formatScore(score)}</span>
            <span className="text-[15px] font-semibold text-neutral-500">/ 10</span>
          </p>
          {band && <span className={`mb-1 rounded-full px-3 py-1 text-[12px] font-extrabold ${BAND_STYLE[band].text} ${BAND_STYLE[band].soft}`}>{BAND_LABEL[band]}</span>}
        </div>
        <ScoreScale score={score} band={band} />

        <details className="group mt-5 border-t border-neutral-100 pt-4">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-neutral-500">What makes up the score</span>
              <span className="text-neutral-400 transition-transform group-open:rotate-180" aria-hidden>
                <ChevronDown className="h-4 w-4" />
              </span>
            </span>
            {day && (
              <span className="mt-2 block text-[12px] text-neutral-500 group-open:hidden">
                {[
                  ['Visits', day.visitShare],
                  ['Active time', day.hoursShare],
                  ['Orders', day.orderShare],
                ].map(([label, share], i) => (
                  <span key={label as string}>
                    {i > 0 && ' · '}
                    {label as string} <b className={BAND_STYLE[scoreBand(partScore(share as number))].text}>{Math.round((share as number) * 100)}%</b>
                  </span>
                ))}
              </span>
            )}
          </summary>
          <div className="mt-4 space-y-4">
            <Contributor
              label="Visits"
              share={day ? day.visitShare : null}
              figure={`${countedVisits} of ${visitTarget} visits`}
              detail={day ? `${day.effectiveVisits} effective${day.ineffectiveVisits > 0 ? ` + ${day.ineffectiveVisits} × ¼` : ''}` : ''}
            />
            <Contributor
              label="Active time"
              share={day ? day.hoursShare : null}
              figure={`${fmt(day?.activeMs ?? 0)} of ${fmt((day?.workingMs ?? 0) - (day?.travelDeductionMs ?? 0))}${day ? ` · ${formatDistance(day.travelMeters)} travelled` : ''}`}
              detail={day ? `${pct(day.activeRatio)} · goal ${pct(SCORE_GOAL_ACTIVE)}${day.travelDeductionMs > 0 ? ` · ${fmt(day.travelDeductionMs)} long travel taken off` : ''}` : ''}
            />
            <Contributor
              label="Orders"
              share={day ? day.orderShare : null}
              figure={`${stats.orderedVisits} of ${stats.totalVisits} visits`}
              detail={day ? [`${pct(day.orderRatio)} · goal ${pct(SCORE_GOAL_ORDERS)}`, orderExtra].filter(Boolean).join(' · ') : ''}
            />
          </div>
        </details>

      </div>

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} title="How the score works">
        <p>
          The score is the average of three parts, times 10. Each part is measured against its own goal and stops counting at 100% of it: visits {pct(SCORE_GOAL_VISITS)} of the target, active time {pct(SCORE_GOAL_ACTIVE)} of working hours,
          orders {pct(SCORE_GOAL_ORDERS)} of visits.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>A visit under {rules.shortVisitMin} min is not credited and earns a quarter of an effective visit.</li>
          <li>
            {rules.travel.enabled
              ? `On a day with more than ${rules.travel.minKm} km of travel and a visit outside Phnom Penh, every full ${rules.travel.stepKm} km takes ${rules.travel.minutes} min off your working time. `
              : ''}
            Clocked in {fmt(stats.totalWorkingMs)}
            {outsideMs > 0 ? `; ${fmt(outsideMs)} outside your hours isn't counted` : ''}.
          </li>
          <li>A visit marked ordered counts until the sale order syncs, up to {ORDER_RECONCILE_DAYS} days after the visit.</li>
          <li>
            A late first visit takes 10% off. After {deadline}{rules.firstVisitFar.enabled ? `, or ${rules.firstVisitFar.extraMin} min later when it is more than ${rules.firstVisitFar.km} km from where you clocked in` : ''}.
          </li>
        </ul>
        <div className="space-y-1.5 border-t border-neutral-100 pt-3">
          {(
            [
              ['poor', 'Under 5'],
              ['average', '5 to 7'],
              ['good', '7 to 9'],
              ['excellent', 'Above 9'],
            ] as [ScoreBand, string][]
          ).map(([b, range]) => (
            <div key={b} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold text-neutral-900">
                <span className={`h-2.5 w-2.5 rounded-full ${BAND_STYLE[b].fill}`} aria-hidden />
                {BAND_LABEL[b]}
              </span>
              <span className="text-neutral-500">{range}</span>
            </div>
          ))}
        </div>
      </InfoSheet>

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
            {firstVisit.kind === 'late' && <Warning title="Late first visit">First visit at {formatTime(new Date(firstVisit.at).toISOString())}, after {deadline}{day?.lateDeduction ? ': score reduced by 10%' : ''}.</Warning>}
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
