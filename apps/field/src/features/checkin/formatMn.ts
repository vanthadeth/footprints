/** "1h 22 mn", "22 mn": the canvas's duration style on the Check in page. */
export function formatMn(ms: number, t: (key: string) => string, language: 'en' | 'km' = 'en'): string {
  const total = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(total / 60)
  const m = total % 60
  const hUnit = language === 'km' ? ` ${t('checkIn.hUnit')} ` : `${t('checkIn.hUnit')} `
  return h > 0 ? `${h}${hUnit}${m} ${t('checkIn.mnUnit')}` : `${m} ${t('checkIn.mnUnit')}`
}
