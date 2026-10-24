import { DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES } from '@footprints/shared/lib/config'
import type { FleetStatus } from '../types'

/** Whole minutes since `atIso`, never negative. */
export function minutesSince(atIso: string, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(atIso).getTime()) / 60_000))
}

/** Compact age for a map badge: "now", "12m", "2h 5m". */
export function ageLabel(minutes: number): string {
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/**
 * Locations here come from clock-in/out and visit check-in/out points (the
 * app has no continuous GPS trail), so an old point only means something
 * when the person is between visits: idling past the admin's idle threshold
 * (the same one the alerts and the journey timeline use). A visiting person is at their
 * customer however long ago they checked in; an off-shift one isn't
 * expected to move.
 */
export function isStale(status: FleetStatus, minutes: number, idleThresholdMinutes: number = DEFAULT_IDLE_ALERT_THRESHOLD_MINUTES): boolean {
  return status === 'IDLING' && minutes >= idleThresholdMinutes
}
