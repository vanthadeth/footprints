import { MapPin } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'

/** The rings, accuracy pill and what it means, while GPS settles or is too weak (canvas Clock in / Check in, GPS states). */
export function GpsRadar({ checking, accuracy, warn, title, hint, onRefresh }: { checking: boolean; accuracy: number | null; warn: boolean; title: string; hint: string; onRefresh: () => void }) {
  const { t } = useLanguage()
  const ring = warn ? 'border-status-warn' : 'border-brand-500'
  const fill = warn ? 'bg-status-warn/10' : 'bg-brand-50'
  return (
    <div className="flex flex-col items-center py-3">
      <div className="relative flex h-[230px] w-[230px] items-center justify-center rounded-full border-2 border-neutral-200">
        <div className={`flex h-[172px] w-[172px] items-center justify-center rounded-full border-[3px] ${ring} ${fill} ${checking ? 'animate-pulse' : ''}`}>
          <div className="flex h-[108px] w-[108px] items-center justify-center rounded-full border-2 border-brand-500/30">
            <span className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${warn ? 'bg-status-warn' : 'bg-brand-500'}`}>
              <MapPin className="h-7 w-7" aria-hidden />
            </span>
          </div>
        </div>
        {accuracy != null && (
          <span className={`absolute bottom-[58px] inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-bold shadow-card ${warn ? 'text-status-warn' : 'text-brand-500'}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />±{Math.round(accuracy).toLocaleString('en-US')} m
          </span>
        )}
      </div>
      <p className="mt-4 text-[19px] font-extrabold text-neutral-900">{title}</p>
      <p className="mt-1 max-w-[280px] text-center text-[13px] font-semibold text-neutral-500">{hint}</p>
      {!checking && (
        <button type="button" onClick={onRefresh} className="mt-3 text-[13px] font-bold text-brand-500">
          {t('checkIn.refresh')}
        </button>
      )}
    </div>
  )
}
