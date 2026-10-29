import { AlertTriangle, Clock, LogOut, MapPinOff } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import type { DayAlert } from './dayAlerts'

const ICON = { late_in: Clock, early_out: LogOut, late_first_visit: Clock, no_first_visit: MapPinOff } as const

/** The things worth noticing about today, at the top of the Check in page: late in, early out, late or missing first visit. */
export function DayAlertsStrip({ alerts }: { alerts: DayAlert[] }) {
  const { t } = useLanguage()
  if (alerts.length === 0) return null
  return (
    <div className="flex flex-col gap-2" role="status" aria-label={t('checkIn.alertsLabel')}>
      {alerts.map((a) => {
        const Icon = ICON[a.id] ?? AlertTriangle
        const danger = a.tone === 'danger'
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 ${danger ? 'border-status-danger/25 bg-status-danger/10' : 'border-status-warn/25 bg-status-warn/10'}`}>
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${danger ? 'bg-status-danger text-white' : 'bg-status-warn text-white'}`}>
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[15px] font-extrabold ${danger ? 'text-status-danger' : 'text-status-warn'}`}>{t(a.title)}</span>
              <span className="block text-[13px] text-neutral-700">{t(a.detail, a.params)}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
