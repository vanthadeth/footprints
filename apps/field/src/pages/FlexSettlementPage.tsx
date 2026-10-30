import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { leaveService } from '@/features/leave/leaveService'
import { flexService } from '@/features/flex/flexService'
import { addDays, cycleLabel, dayDate, days } from '@/features/flex/flex'
import type { FlexProgress } from '@/features/flex/progress'

/**
 * Leave › Working days › Settlement: how a closed cycle came out against the
 * minimum -- days worked, leave and holidays counted, and then either "met"
 * (extra days are not carried over) or the days short, counted as absent and
 * taken from annual leave first, then unpaid.
 */
export function FlexSettlementPage() {
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const [params] = useSearchParams()
  const end = params.get('end')
  const userId = params.get('user')
  const [progress, setProgress] = useState<FlexProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    flexService
      .progress(userId, end)
      .then((p) => !cancelled && setProgress(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('workDays.settleLoadFailed')))
    return () => {
      cancelled = true
    }
  }, [end, userId, t])

  // Annual leave before the settlement, for "goes from X to Y" (the settlement is already in the balance).
  const [annualNow, setAnnualNow] = useState<number | null>(null)
  useEffect(() => {
    if (userId || !progress?.settled || !profile) return
    let cancelled = false
    leaveService
      .listBalances(Number(progress.cycleEnd.slice(0, 4)))
      .then((rows) => !cancelled && setAnnualNow(rows.find((r) => r.user_id === profile.id && r.leave_type === 'annual')?.remaining_days ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, progress, profile])

  if (error) return <p className="mx-auto max-w-lg px-4 pt-4 text-sm text-status-danger">{error}</p>
  if (!progress) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-3">
        <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }

  const min = progress.minDays ?? 0
  const short = progress.shortDays
  const met = !progress.legacy && short === 0
  const al = progress.annualDays ?? Math.min(short, 0)
  const ul = progress.unpaidDays ?? 0
  const when = dayDate(addDays(progress.cycleEnd, 1), language)
  const alAfter = annualNow ?? 0
  const alBefore = alAfter + al

  const result = progress.legacy
    ? { tone: 'mu', title: t('workDays.resLegacyT'), sub: t('workDays.resLegacyS') }
    : met
      ? { tone: 'mu', title: t('workDays.resMetT'), sub: t('workDays.resMetS', { worked: days(progress.worked), credited: days(progress.credited) }) }
      : ul === 0
        ? { tone: 'wn', title: t('workDays.resAnnualT', { n: days(al) }), sub: t('workDays.resAnnualS', { from: days(alBefore), to: days(alAfter) }) }
        : al === 0
          ? { tone: 'wn', title: t('workDays.resUnpaidT', { n: days(ul) }), sub: t('workDays.resUnpaidS') }
          : { tone: 'wn', title: t('workDays.resBothT', { al: days(al), ul: days(ul) }), sub: t('workDays.resBothS', { al: days(al) }) }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3 md:max-w-2xl">
      <p className="px-0.5 text-[13px] text-neutral-500">{cycleLabel(progress, language)}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <p className="text-[12.5px] font-semibold text-neutral-500">{t('workDays.setMinimum')}</p>
          <p className="text-[34px] font-extrabold leading-10 tracking-tight text-neutral-900">{progress.legacy ? '–' : min}</p>
          <p className="text-[12px] text-neutral-500">{t('workDays.setMinimumSub')}</p>
        </div>
        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <p className="text-[12.5px] font-semibold text-neutral-500">{met ? t('workDays.setAbove') : t('workDays.setShortBy')}</p>
          <p className={`text-[34px] font-extrabold leading-10 tracking-tight ${met ? 'text-status-working' : 'text-status-danger'}`}>{progress.legacy ? '–' : days(met ? progress.aboveDays : short)}</p>
          <p className="text-[12px] text-neutral-500">{met ? t('workDays.setAboveSub') : t('workDays.setShortSub')}</p>
        </div>
      </div>

      {!progress.legacy && (
        <div className="rounded-2xl bg-white px-4 py-1 shadow-card">
          {[
            [t('workDays.rowWorkedT'), t('workDays.rowWorkedS'), days(progress.worked), ''],
            [t('workDays.rowCreditedT'), t('workDays.rowCreditedS'), days(progress.credited), ''],
            [met ? t('workDays.rowAboveT') : t('workDays.rowBelowT'), met ? t('workDays.rowAboveS') : t('workDays.rowBelowS'), days(met ? progress.aboveDays : short), met ? 'text-status-working' : 'text-status-danger'],
          ].map(([title, sub, value, tone]) => (
            <div key={title} className="flex items-center justify-between gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-800">
              <span className="min-w-0">
                <span className="block text-[14.5px] font-extrabold text-neutral-900">{title}</span>
                <span className="block text-[12.5px] text-neutral-500">{sub}</span>
              </span>
              <span className={`text-[20px] font-extrabold tabular-nums ${tone || 'text-neutral-900'}`}>{value}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`flex gap-2.5 rounded-2xl p-4 ${result.tone === 'wn' ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'}`} role="status">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className={`text-[16px] font-extrabold ${result.tone === 'wn' ? '' : 'text-neutral-900'}`}>{result.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug">{result.sub}</p>
        </div>
      </div>

      <p className="px-1 text-[12px] leading-snug text-neutral-500">{t(progress.settled ? 'workDays.settledAuto' : 'workDays.settlesAuto', { date: when })}</p>
    </div>
  )
}
