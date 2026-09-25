import { distanceInMeters } from '@/lib/geo'

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteStop extends LatLng {
  id: string
}

/** Assumed average door-to-door speed across town traffic, for the rough "~N min" ETA. */
export const AVERAGE_SPEED_KMH = 20

/**
 * Greedy nearest-neighbour ordering from `start`: always drive to the
 * closest stop not yet visited. Not optimal, but a good-enough route for a
 * handful of shops and instant on a phone. With no start (no GPS fix) it
 * begins from the first stop as given.
 */
export function nearestNeighbourOrder<T extends RouteStop>(start: LatLng | null, stops: T[]): T[] {
  const remaining = [...stops]
  const ordered: T[] = []
  let here: LatLng | null = start
  while (remaining.length > 0) {
    let best = 0
    if (here) {
      let bestDist = Infinity
      remaining.forEach((s, i) => {
        const d = distanceInMeters(here!.lat, here!.lng, s.lat, s.lng)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
    }
    const [next] = remaining.splice(best, 1)
    ordered.push(next)
    here = next
  }
  return ordered
}

/** Straight-line length in metres of start -> stops[0] -> stops[1] -> ... (0 for nothing to visit). */
export function routeDistance(start: LatLng | null, stops: LatLng[]): number {
  let total = 0
  let here = start
  for (const s of stops) {
    if (here) total += distanceInMeters(here.lat, here.lng, s.lat, s.lng)
    here = s
  }
  return total
}

/** Rough drive time in whole minutes (at least 1) for a straight-line distance, padded 30% for real roads. */
export function etaMinutes(meters: number, speedKmh = AVERAGE_SPEED_KMH): number {
  return Math.max(1, Math.round(((meters * 1.3) / 1000 / speedKmh) * 60))
}

/** Google Maps turn-by-turn directions to a point (opens the app on phones). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}
