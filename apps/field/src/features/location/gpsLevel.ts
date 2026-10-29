export type GpsLevel = 'good' | 'moderate' | 'low' | 'tooLow'

/** Accuracy (metres, smaller is better) to the four steps on the Clock in / Check in canvas: ±60 good, ±240 moderate, ±480 low, ±1,200 too low. */
export function gpsLevel(accuracyM: number): GpsLevel {
  if (accuracyM <= 100) return 'good'
  if (accuracyM <= 300) return 'moderate'
  if (accuracyM <= 600) return 'low'
  return 'tooLow'
}

/** Text colour class and i18n keys (headline, hint) for one level. */
export const GPS_LEVEL_COPY: Record<GpsLevel, { tone: string; title: string; hint: string }> = {
  good: { tone: 'text-status-working', title: 'checkIn.gpsGood', hint: 'checkIn.gpsGoodHint' },
  moderate: { tone: 'text-status-working', title: 'checkIn.gpsModerate', hint: 'checkIn.gpsModerateHint' },
  low: { tone: 'text-status-warn', title: 'checkIn.gpsLow', hint: 'checkIn.gpsLowHint' },
  tooLow: { tone: 'text-status-warn', title: 'checkIn.gpsTooLow', hint: 'checkIn.gpsTooLowHint' },
}
