import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { cycleLabel, dayDate, days } from './flex'
import { counted, type FlexProgress } from './progress'

/** The Leave tab's shortcut to Working days, for people on flexible days off. */
export function FlexCard({ progress }: { progress: FlexProgress }) {
  const { t, language } = useLanguage()
  const min = progress.minDays ?? 0
  const have = counted(progress)
  const short = !progress.legacy && (progress.settled || progress.closed ? progress.shortDays > 0 : progress.spare < 0)
  return (
    <Link
      to="/leave/days-off"
      aria-label={`${t('workDays.cardTitle')} ${days(have)} ${t('workDays.cardOf', { n: min })}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-visiting/10 text-status-visiting">
        <CalendarCheck className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">{t('workDays.cardTitle')}</span>
        <span className="block truncate text-[12.5px] text-neutral-500">{t('workDays.cardSub', { cycle: cycleLabel(progress, language), date: dayDate(progress.cycleEnd, language) })}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[22px] font-extrabold leading-none ${short ? 'text-status-danger' : 'text-neutral-900'}`}>{days(have)}</span>
        <span className="block text-[11px] font-semibold text-neutral-500">{short ? t('workDays.cardShort') : t('workDays.cardOf', { n: min })}</span>
      </span>
    </Link>
  )
}
