import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { cycleLabel, dayDate, days, over, type FlexCycle } from './flex'

/** The Leave tab's shortcut to Days off, for people on flexible days off. */
export function FlexCard({ cycle }: { cycle: FlexCycle }) {
  const { t, language } = useLanguage()
  const o = over(cycle)
  return (
    <Link
      to="/leave/days-off"
      aria-label={t('leave.flexAria', { text: o ? t('leave.flexOverText', { n: days(o) }) : t('leave.flexLeftText', { left: days(cycle.left), allowance: days(cycle.allowance) }) })}
      className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-visiting/10 text-status-visiting">
        <CalendarRange className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">{t('leave.flexTitle')}</span>
        <span className="block truncate text-[12.5px] text-neutral-500">
          {cycleLabel(cycle, language)}
          {cycle.planned > 0 && t('leave.flexPlanned', { n: days(cycle.planned) })}
          {t('leave.flexSettles', { date: dayDate(cycle.cycleEnd, language) })}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[22px] font-extrabold leading-none ${o ? 'text-status-danger' : 'text-neutral-900'}`}>{o ? `+${days(o)}` : days(cycle.left)}</span>
        <span className="block text-[11px] font-semibold text-neutral-500">{o ? t('leave.flexOver') : t('leave.flexOfLeft', { allowance: days(cycle.allowance) })}</span>
      </span>
    </Link>
  )
}
