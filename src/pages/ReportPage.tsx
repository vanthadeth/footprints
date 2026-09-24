import { useMemo, useState } from 'react'
import { Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useProfile } from '@/features/auth/useProfile'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import {
  bucketAverage,
  comparableCutoff,
  effectiveness,
  highlightSentence,
  previousLabel,
  topCustomers,
  visitBuckets,
  type ReportPeriod,
} from '@/features/reports/personalReport'
import { getPresetRange } from '@/lib/dateRange'
import { formatDuration } from '@/lib/datetime'
import { useLanguage } from '@/i18n/LanguageContext'

const RANGES = {
  today: { current: 'today', previous: 'yesterday', chart: 'Visits by hour', unit: 'hour' },
  week: { current: 'this_week', previous: 'last_week', chart: 'Visits per day', unit: 'day' },
  month: { current: 'this_month', previous: 'last_month', chart: 'Visits per week', unit: 'week' },
} as const

const CHART_HEIGHT = 104
const CUR_SHORT: Record<ReportPeriod, string> = { today: 'Today', week: 'This week', month: 'This month' }
const PREV_SHORT: Record<ReportPeriod, string> = { today: 'Yesterday', week: 'Last week', month: 'Last month' }

/**
 * The Report tab: the signed-in user's own performance for Today / This
 * Week / This Month (Apple Health-style) -- a highlight against the
 * previous period, four headline numbers with their change, a bar chart
 * with an average line, and the customers they visited most.
 */
export function ReportPage() {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const [period, setPeriod] = useState<ReportPeriod>('week')
  const cfg = RANGES[period]
  const range = useMemo(() => getPresetRange(RANGES[period].current), [period])
  const prevRange = useMemo(() => getPresetRange(RANGES[period].previous), [period])
  const current = useJourneyHistory(profile?.id ?? null, range)
  const previous = useJourneyHistory(profile?.id ?? null, prevRange)

  const stats = useMemo(() => computeJourneyStats(current.days), [current.days])
  // Compare against the same stretch of the previous period (Mon–Thu vs Mon–Thu), not all of it.
  const prevStats = useMemo(() => {
    const cutoff = comparableCutoff(range.startIso, prevRange.startIso, new Date().toISOString(), prevRange.endIso)
    const trimmed = previous.days.map((d) => ({
      ...d,
      attendance: d.attendance.filter((a) => a.clock_in_at < cutoff),
      visits: d.visits.filter((v) => v.checked_in_at < cutoff),
    }))
    const endMs = new Date(cutoff).getTime()
    return computeJourneyStats(trimmed, endMs)
  }, [previous.days, range.startIso, prevRange.startIso, prevRange.endIso])
  const buckets = useMemo(() => visitBuckets(period, current.allVisits, new Date().toISOString()), [period, current.allVisits])
  const avg = bucketAverage(buckets)
  const max = Math.max(1, ...buckets.map((b) => b.value ?? 0), avg)
  const top = useMemo(() => topCustomers(current.allVisits), [current.allVisits])
  const names = useCustomerNames(top.map((t) => t.customerId))

  const eff = effectiveness(stats)
  const prevEff = effectiveness(prevStats)
  const vsPrev = `vs ${previousLabel(period)}`
  const metrics = [
    {
      label: 'Visits',
      value: String(stats.totalVisits),
      delta: stats.totalVisits - prevStats.totalVisits,
      deltaText: signed(stats.totalVisits - prevStats.totalVisits) + ' ' + vsPrev,
    },
    {
      label: 'Working time',
      value: formatDuration(stats.totalWorkingMs, language),
      delta: Math.round((stats.totalWorkingMs - prevStats.totalWorkingMs) / 60_000),
      deltaText: `${signedDuration(stats.totalWorkingMs - prevStats.totalWorkingMs, language)} ${vsPrev}`,
    },
    {
      label: 'Avg. visit',
      value: stats.totalVisits ? formatDuration(stats.averageVisitMs, language) : '—',
      delta: stats.totalVisits && prevStats.totalVisits ? Math.round((stats.averageVisitMs - prevStats.averageVisitMs) / 60_000) : 0,
      deltaText:
        stats.totalVisits && prevStats.totalVisits ? `${signed(Math.round((stats.averageVisitMs - prevStats.averageVisitMs) / 60_000))} min ${vsPrev}` : 'Not enough data yet',
    },
    {
      label: 'Effectiveness',
      value: `${Math.round(eff * 100)}%`,
      delta: Math.round((eff - prevEff) * 100),
      deltaText: `${signed(Math.round((eff - prevEff) * 100))} pts ${vsPrev}`,
      accent: true,
    },
  ]

  const hlMax = Math.max(1, stats.totalVisits, prevStats.totalVisits)
  const loading = current.loading || previous.loading

  return (
    <div className="mx-auto max-w-lg space-y-3.5 px-4 pb-6 pt-1 md:max-w-3xl md:px-8 md:pt-4">
      <SegmentedControl
        ariaLabel="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />

      {current.error && <p className="text-sm text-status-danger">{current.error}</p>}

      <div className={`space-y-3.5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-status-visiting dark:text-violet-300">
            <Sparkles className="h-4 w-4" aria-hidden />
            Highlight
          </span>
          <p className="text-base font-bold leading-snug text-neutral-900">{highlightSentence(period, stats.totalVisits, prevStats.totalVisits)}</p>
          <div className="space-y-2">
            <CompareBar label={CUR_SHORT[period]} value={stats.totalVisits} max={hlMax} strong />
            <CompareBar label={PREV_SHORT[period]} value={prevStats.totalVisits} max={hlMax} />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1 rounded-2xl bg-white p-3.5 shadow-card">
              <p className="text-xs font-semibold text-neutral-500">{m.label}</p>
              <p className={`text-2xl font-extrabold tracking-tight ${m.accent ? 'text-status-working dark:text-emerald-300' : 'text-neutral-900'}`}>{m.value}</p>
              <p className={`flex items-center gap-1 text-[11.5px] font-bold ${deltaTone(m.delta)}`}>
                {m.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : m.delta < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
                {m.deltaText}
              </p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold text-neutral-900">{cfg.chart}</h2>
            <span className="text-xs text-neutral-500">
              Avg {Math.round(avg * 10) / 10} / {cfg.unit}
            </span>
          </div>
          <div className="relative mt-3 flex h-[132px] items-end gap-1.5 border-b border-neutral-100 dark:border-neutral-800">
            <div
              className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-neutral-400 opacity-70"
              style={{ bottom: Math.round((avg / max) * CHART_HEIGHT) }}
              aria-hidden
            />
            {buckets.map((b) => (
              <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className={`text-[11px] font-bold ${b.current ? 'text-brand-500' : 'text-neutral-600'}`}>{b.value ?? ''}</span>
                <div
                  className={`w-full max-w-[28px] rounded-t-md ${b.value === null ? 'bg-neutral-100' : b.current ? 'bg-brand-400' : 'bg-brand-500'}`}
                  style={{ height: b.value === null ? 4 : Math.max(4, Math.round((b.value / max) * CHART_HEIGHT)) }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {buckets.map((b) => (
              <span key={b.label} className={`flex-1 text-center text-[11px] ${b.current ? 'font-extrabold text-brand-500' : 'font-semibold text-neutral-500'}`}>
                {b.label}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-0.5 text-[17px] font-bold text-neutral-900">Top customers</h2>
          {top.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-5 text-center text-sm text-neutral-500 shadow-card">No customer visits in this period yet.</p>
          ) : (
            <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
              {top.map((c, i) => (
                <div key={c.customerId} className="space-y-1.5 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-50 text-xs font-extrabold text-brand-700">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{names[c.customerId] ?? '…'}</span>
                    <span className="text-[12.5px] font-bold text-neutral-600">
                      {c.visits} {c.visits === 1 ? 'visit' : 'visits'}
                    </span>
                  </div>
                  <div className="ml-8 h-1 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.visits / top[0].visits) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function CompareBar({ label, value, max, strong = false }: { label: string; value: number; max: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[76px] shrink-0 truncate text-xs font-semibold text-neutral-600">{label}</span>
      <span className="flex h-[22px] flex-1 overflow-hidden rounded-md bg-neutral-100">
        <span className={`rounded-md ${strong ? 'bg-status-visiting' : 'bg-neutral-300'}`} style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className={`w-7 text-right text-[13px] font-extrabold ${strong ? 'text-neutral-900' : 'text-neutral-600'}`}>{value}</span>
    </div>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0'
}

function signedDuration(ms: number, language: 'en' | 'km'): string {
  if (Math.abs(ms) < 60_000) return '±0'
  return `${ms > 0 ? '+' : '−'}${formatDuration(Math.abs(ms), language)}`
}

function deltaTone(delta: number): string {
  if (delta > 0) return 'text-status-working dark:text-emerald-300'
  if (delta < 0) return 'text-status-warn'
  return 'text-neutral-500'
}
