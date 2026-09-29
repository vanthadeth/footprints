import { useEffect, useState } from 'react'
import { distanceInMeters, formatDistance } from '@/lib/geo'
import { permissionsService, type Direction, type RequiredLocation } from './permissionsService'

export type ClockRules = Record<Direction, RequiredLocation[]>

export interface ClockBlock {
  names: string
  nearest: string
  distance: string
}

/** "Office or Warehouse" -- same wording as app.assert_clock_location. */
export function joinNames(locs: RequiredLocation[]): string {
  return [...locs].map((l) => l.name).sort((a, b) => a.localeCompare(b)).join(' or ')
}

/**
 * Whether a position is outside every required location (null = fine, or
 * no rule). Mirrors app.assert_clock_location so the app can say so before
 * a selfie is taken; the server check stays the real guard.
 */
export function clockBlock(required: RequiredLocation[], position: { latitude: number; longitude: number }): ClockBlock | null {
  if (required.length === 0) return null
  let best: { loc: RequiredLocation; d: number } | null = null
  for (const loc of required) {
    const d = distanceInMeters(position.latitude, position.longitude, loc.latitude, loc.longitude)
    if (d <= loc.radius_m) return null
    if (!best || d < best.d) best = { loc, d }
  }
  return { names: joinNames(required), nearest: best!.loc.name, distance: formatDistance(best!.d) }
}

/** The caller's clock-in/out location rules (my_clock_rules); empty lists = anywhere. */
export function useClockRules(): ClockRules {
  const [rules, setRules] = useState<ClockRules>({ in: [], out: [] })
  useEffect(() => {
    let cancelled = false
    permissionsService
      .myClockRules()
      .then((r) => {
        if (!cancelled) setRules({ in: r?.in ?? [], out: r?.out ?? [] })
      })
      .catch(() => {
        // No hint then -- the server still enforces the rule on clock in/out.
      })
    return () => {
      cancelled = true
    }
  }, [])
  return rules
}
