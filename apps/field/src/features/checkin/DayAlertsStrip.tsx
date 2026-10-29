import { Clock, LogOut, MapPinOff } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import type { DayAlert } from './dayAlerts'

const ICON = { late_in: Clock, early_out: LogOut, late_first_visit: Clock, no_first_visit: MapPinOff } as const

/** What's worth noticing about today, one short line each: late in, early out, late or missing first visit. */
export function DayAlertsStrip({ alerts }: { alerts: DayAlert[] }) {
  const { t } = useLanguage()
  if (alerts.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5" aria-label={t('checkIn.alertsLabel')}>
      {alerts.map((a) => {
        const Icon = ICON[a.id]
        const danger = a.tone === 'danger'
        return (
          <li key={a.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold ${danger ? 'bg-status-danger/10 text-status-danger' : 'bg-status-warn/10 text-status-warn'}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {t(a.title, a.params)}
          </li>
        )
      })}
    </ul>
  )
}
