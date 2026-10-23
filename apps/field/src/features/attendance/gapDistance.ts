import { distanceInMeters } from '@/lib/geo'
import { visitSpan } from './flagRules'

/** A place the person was at a moment: a clock-in or clock-out, or a visit's check-in or check-out. */
export interface GeoPoint {
  t: number
  lat: number
  lng: number
}

interface SessionGeo {
  clock_in_at: string
  clock_out_at: string | null
  clock_in_latitude?: number | null
  clock_in_longitude?: number | null
  clock_out_latitude?: number | null
  clock_out_longitude?: number | null
}

interface VisitGeo {
  checked_in_at: string
  checked_out_at: string | null
  cancelled_at?: string | null
  flags?: string[] | null
  in_latitude?: number | null
  in_longitude?: number | null
  out_latitude?: number | null
  out_longitude?: number | null
}

/**
 * The day's known places in time order. A visit's out point is stamped at the end of its
 * counted span (a forgotten check-out is capped), so it lines up with where the gap after it starts.
 */
export function geoPoints(sessions: SessionGeo[], visits: VisitGeo[], now: number, forgottenCapMin: number): GeoPoint[] {
  const pts: GeoPoint[] = []
  for (const s of sessions) {
    if (s.clock_in_latitude != null && s.clock_in_longitude != null) pts.push({ t: Date.parse(s.clock_in_at), lat: s.clock_in_latitude, lng: s.clock_in_longitude })
    if (s.clock_out_at && s.clock_out_latitude != null && s.clock_out_longitude != null) pts.push({ t: Date.parse(s.clock_out_at), lat: s.clock_out_latitude, lng: s.clock_out_longitude })
  }
  for (const v of visits) {
    if (v.cancelled_at || v.in_latitude == null || v.in_longitude == null) continue
    const [start, end] = visitSpan(v, now, forgottenCapMin)
    pts.push({ t: start, lat: v.in_latitude, lng: v.in_longitude })
    if (v.checked_out_at) pts.push({ t: end, lat: v.out_latitude ?? v.in_latitude, lng: v.out_longitude ?? v.in_longitude })
  }
  return pts.sort((a, b) => a.t - b.t)
}

const TOLERANCE_MS = 1000

/**
 * How far the person travelled across a gap from `fromMs` to `toMs`: from the last place
 * at the gap's start to the first place at its end. 0 when either end has no position
 * (a gap that is still open, or an old row without coordinates), so the normal limit applies.
 */
export function gapDistanceM(points: GeoPoint[], fromMs: number, toMs: number): number {
  let prev: GeoPoint | undefined
  for (const p of points) if (p.t <= fromMs + TOLERANCE_MS) prev = p
  const next = points.find((p) => p.t >= toMs - TOLERANCE_MS)
  return prev && next ? distanceInMeters(prev.lat, prev.lng, next.lat, next.lng) : 0
}
