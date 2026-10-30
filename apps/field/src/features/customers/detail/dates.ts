import type { Language } from '@footprints/shared/lib/language'

const KM_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ']

/** Full month name (m0 = 0 for January): English or Khmer. */
export function monthName(m0: number, language: Language = 'en'): string {
  return language === 'km' ? `${KM_MONTHS[m0]}` : new Date(Date.UTC(2000, m0, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
}

/** y / m / d of a "YYYY-MM-DD" day or an ISO instant (instants are read in Phnom Penh). */
function ymd(iso: string): [number, number, number] {
  if (iso.length === 10) return iso.split('-').map(Number) as [number, number, number]
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return p.split('-').map(Number) as [number, number, number]
}

const pad = (n: number) => String(n).padStart(2, '0')
const en = (y: number, m: number, d: number, o: Intl.DateTimeFormatOptions) => new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' })

/** "28 Oct 2026", or dd/mm/yyyy in Khmer. */
export function fullDate(iso: string, language: Language = 'en'): string {
  const [y, m, d] = ymd(iso)
  return language === 'km' ? `${pad(d)}/${pad(m)}/${y}` : en(y, m, d, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "28 Oct", or dd/mm in Khmer. */
export function dayMonth(iso: string | null, language: Language = 'en'): string {
  if (!iso) return '—'
  const [y, m, d] = ymd(iso.slice(0, 10))
  return language === 'km' ? `${pad(d)}/${pad(m)}` : en(y, m, d, { day: 'numeric', month: 'short' })
}

/** "October 2026", or "ខែតុលា 2026" in Khmer. */
export function monthYear(iso: string, language: Language = 'en'): string {
  const [y, m, d] = ymd(iso.slice(0, 10))
  return language === 'km' ? `ខែ${KM_MONTHS[m - 1]} ${y}` : en(y, m, d, { month: 'long', year: 'numeric' })
}
