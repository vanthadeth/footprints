import { GAP_FLAG_MAX_DISTANCE_METERS, GAP_FLAG_THRESHOLD_MINUTES } from '@/lib/config'
import { distanceInMeters } from '@/lib/geo'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'

export type RouteEventKind = 'clock-in' | 'visit' | 'idle' | 'clock-out'

export interface RouteEvent {
  kind: RouteEventKind
  start: string
  end: string | null
  lat: number
  lng: number
  /** 1-based visit number (visits only). */
  n?: number
  customerId?: string | null
  /** Visit still open / idle still ongoing. */
  ongoing?: boolean
  /** Visit carries review flags (short, auto check-out, out of range…). */
  flagged?: boolean
  minutes: number
}

export interface TeamRoute {
  events: RouteEvent[]
  path: [number, number][]
  stats: { visits: number; distanceMeters: number; visitingMs: number; idleMs: number }
}

const mins = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000))

interface Stop {
  kind: 'clock-in' | 'visit' | 'clock-out'
  start: string
  end: string | null
  inLat: number
  inLng: number
  outLat: number
  outLng: number
  customerId?: string | null
  flagged?: boolean
  sessionEnd?: boolean
}

/**
 * One person's day as an ordered route: clock-in, each visit (numbered),
 * idle stretches, clock-out -- and the path through them. Idle uses the
 * same rule the journey timeline flags a gap by: longer than
 * GAP_FLAG_THRESHOLD_MINUTES while moving no further than
 * GAP_FLAG_MAX_DISTANCE_METERS. A trailing gap (last check-out until now,
 * still clocked in) counts too. Gaps across a clock-out are off the clock.
 */
export function buildTeamRoute(day: DayJourney | null, nowIso: string = new Date().toISOString()): TeamRoute {
  if (!day) return { events: [], path: [], stats: { visits: 0, distanceMeters: 0, visitingMs: 0, idleMs: 0 } }

  const stops: Stop[] = []
  for (const a of day.attendance) {
    stops.push({ kind: 'clock-in', start: a.clock_in_at, end: a.clock_in_at, inLat: a.clock_in_latitude, inLng: a.clock_in_longitude, outLat: a.clock_in_latitude, outLng: a.clock_in_longitude })
    if (a.clock_out_at && a.clock_out_latitude != null && a.clock_out_longitude != null) {
      stops.push({ kind: 'clock-out', start: a.clock_out_at, end: a.clock_out_at, inLat: a.clock_out_latitude, inLng: a.clock_out_longitude, outLat: a.clock_out_latitude, outLng: a.clock_out_longitude, sessionEnd: true })
    }
  }
  for (const v of day.visits) {
    if (v.cancelled_at || v.in_latitude == null || v.in_longitude == null) continue
    stops.push({
      kind: 'visit',
      start: v.checked_in_at,
      end: v.checked_out_at,
      inLat: v.in_latitude,
      inLng: v.in_longitude,
      outLat: v.out_latitude ?? v.in_latitude,
      outLng: v.out_longitude ?? v.in_longitude,
      customerId: v.customer_id,
      flagged: v.auto_closed || v.out_of_range || (v.flags ?? []).some((f) => f !== 'UNASSIGNED_VISIT'),
    })
  }
  stops.sort((a, b) => a.start.localeCompare(b.start))

  const events: RouteEvent[] = []
  const path: [number, number][] = []
  let visitN = 0
  let visitingMs = 0
  let idleMs = 0
  let distance = 0

  const idleIfLong = (prev: Stop, nextStartIso: string, nextLat: number, nextLng: number, ongoing: boolean) => {
    if (!prev.end) return
    const gap = mins(prev.end, nextStartIso)
    const moved = distanceInMeters(prev.outLat, prev.outLng, nextLat, nextLng)
    if (gap > GAP_FLAG_THRESHOLD_MINUTES && moved <= GAP_FLAG_MAX_DISTANCE_METERS) {
      events.push({ kind: 'idle', start: prev.end, end: ongoing ? null : nextStartIso, lat: prev.outLat, lng: prev.outLng, minutes: gap, ongoing })
      idleMs += gap * 60_000
    }
  }

  stops.forEach((s, i) => {
    const prev = stops[i - 1]
    if (prev && !prev.sessionEnd && s.kind !== 'clock-in') idleIfLong(prev, s.start, s.inLat, s.inLng, false)
    if (prev) distance += distanceInMeters(prev.outLat, prev.outLng, s.inLat, s.inLng)
    path.push([s.inLat, s.inLng])
    if (s.kind === 'visit') {
      visitN += 1
      const end = s.end ?? nowIso
      visitingMs += Math.max(0, new Date(end).getTime() - new Date(s.start).getTime())
      events.push({ kind: 'visit', start: s.start, end: s.end, lat: s.inLat, lng: s.inLng, n: visitN, customerId: s.customerId, ongoing: !s.end, flagged: s.flagged, minutes: mins(s.start, end) })
    } else {
      events.push({ kind: s.kind, start: s.start, end: s.end, lat: s.inLat, lng: s.inLng, minutes: 0 })
    }
  })

  // Still on shift with nothing open since the last stop: that trailing gap may itself be idling.
  const last = stops[stops.length - 1]
  if (last && last.kind === 'visit' && last.end) idleIfLong(last, nowIso, last.outLat, last.outLng, true)

  return { events, path, stats: { visits: visitN, distanceMeters: Math.round(distance), visitingMs, idleMs } }
}
