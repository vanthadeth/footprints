import { useLanguage } from '@footprints/shared/i18n/LanguageContext'

const KM_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Apple Calendar-style month/day block. `date` is a local "YYYY-MM-DD" string (no timezone shift). */
export function DateTile({ date, accent = false }: { date: string; accent?: boolean }) {
  const { language } = useLanguage()
  const [, m, d] = date.split('-').map(Number)
  const month = language === 'km' ? KM_MONTHS[m - 1] : MONTHS[m - 1]
  if (accent) {
    return (
      <div className="w-[52px] shrink-0 overflow-hidden rounded-xl border border-neutral-200 text-center">
        <div className="bg-status-danger py-0.5 text-[10px] font-extrabold tracking-wider text-white">{month}</div>
        <div className="py-0.5 text-[22px] font-extrabold text-neutral-900">{d}</div>
      </div>
    )
  }
  return (
    <div className="w-11 shrink-0 text-center">
      <div className="text-[10.5px] font-extrabold tracking-wider text-neutral-500">{month}</div>
      <div className="text-[19px] font-extrabold leading-tight text-neutral-900">{d}</div>
    </div>
  )
}
