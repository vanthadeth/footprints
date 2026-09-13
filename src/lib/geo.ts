/**
 * Client-side geographic helpers. The server (app.metres_between, a
 * Haversine formula) is always the authority for any figure that gets
 * stored -- this is only for immediate UI feedback (e.g. "320 m away")
 * before a round trip completes.
 */

const EARTH_RADIUS_M = 6_371_000

/** Great-circle distance in metres. Never subtract raw lat/lng directly. */
export function distanceInMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
