import { Marker, Polyline, Popup } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { formatDuration, formatTime } from '@/lib/datetime'
import type { AttendanceRow, VisitRow } from './types'

// Matches tailwind.config.js's status.working (green), status.warn (amber),
// and neutral.700 (dark grey) exactly -- inline hex since these are
// leaflet/SVG marker fills, not Tailwind classes.
const CHECK_IN_COLOR = '#0f6e4f'
const CHECK_OUT_COLOR = '#b8590f'
const VISIT_COLOR = '#3d4351'
/** Clock-in/out are a plain small pin (no label); a visit pin stays full-size to fit its number. */
const SMALL_PIN_SIZE = 22

type MapPoint =
  | { kind: 'clock-in'; time: string; lat: number; lng: number; session: AttendanceRow }
  | { kind: 'clock-out'; time: string; lat: number; lng: number; session: AttendanceRow }
  | { kind: 'visit'; time: string; lat: number; lng: number; visit: VisitRow; index: number }

/**
 * Personal journey map: each visit as a numbered dark-grey pin, plus small
 * green clock-in and amber clock-out pins for every attendance session that
 * day, all connected chronologically (spec §32) -- so the route shown here
 * matches the same day's timeline: where the day started, every stop in
 * between, and where it ended (or last ended, if clocked out and back in
 * more than once). Points with no recorded position (shouldn't happen --
 * GPS is required at check-in/clock-in -- but defends against bad data) are
 * simply skipped rather than crashing the map.
 */
export function JourneyMap({
  visits,
  customerNames,
  attendance = [],
  height,
}: {
  visits: VisitRow[]
  customerNames: Record<string, string>
  /** Optional so existing visit-only callers are unaffected. */
  attendance?: AttendanceRow[]
  /** Forwarded to MapView -- defaults to its own compact height when omitted. */
  height?: number | string
}) {
  const items: MapPoint[] = []

  for (const session of attendance) {
    if (session.clock_in_latitude != null && session.clock_in_longitude != null) {
      items.push({ kind: 'clock-in', time: session.clock_in_at, lat: session.clock_in_latitude, lng: session.clock_in_longitude, session })
    }
    if (session.clock_out_at && session.clock_out_latitude != null && session.clock_out_longitude != null) {
      items.push({ kind: 'clock-out', time: session.clock_out_at, lat: session.clock_out_latitude, lng: session.clock_out_longitude, session })
    }
  }

  const sortedVisits = [...visits]
    .filter((v) => v.in_latitude != null && v.in_longitude != null)
    .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
  sortedVisits.forEach((visit, index) => {
    items.push({ kind: 'visit', time: visit.checked_in_at, lat: visit.in_latitude!, lng: visit.in_longitude!, visit, index })
  })

  items.sort((a, b) => a.time.localeCompare(b.time))
  const points: LatLngExpression[] = items.map((p) => [p.lat, p.lng])

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl2 bg-neutral-100 text-sm text-neutral-400" style={{ height: height ?? 192 }}>
        No visit locations yet
      </div>
    )
  }

  return (
    <MapView points={points} height={height}>
      {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#0f6e4f', weight: 3, opacity: 0.6 }} />}
      {items.map((p) => {
        if (p.kind === 'clock-in') {
          return (
            <Marker key={`in-${p.session.id}`} position={[p.lat, p.lng]} icon={pinIcon(CHECK_IN_COLOR, { size: SMALL_PIN_SIZE })}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">Clock In</p>
                  <p className="text-neutral-500">{formatTime(p.time)}</p>
                </div>
              </Popup>
            </Marker>
          )
        }
        if (p.kind === 'clock-out') {
          const session = p.session
          return (
            <Marker key={`out-${session.id}`} position={[p.lat, p.lng]} icon={pinIcon(CHECK_OUT_COLOR, { size: SMALL_PIN_SIZE })}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">Clock Out</p>
                  <p className="text-neutral-500">
                    {formatTime(p.time)} · {formatDuration(new Date(session.clock_out_at!).getTime() - new Date(session.clock_in_at).getTime())}
                  </p>
                </div>
              </Popup>
            </Marker>
          )
        }
        const visit = p.visit
        return (
          <Marker key={visit.id} position={[p.lat, p.lng]} icon={pinIcon(VISIT_COLOR, { label: String(p.index + 1) })}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">Visit #{visit.visit_number ?? p.index + 1}</p>
                <p>{visit.customer_id ? customerNames[visit.customer_id] ?? 'Loading…' : 'Unassigned'}</p>
                <p className="text-neutral-500">
                  {formatTime(visit.checked_in_at)}
                  {visit.checked_out_at &&
                    ` · ${formatDuration(new Date(visit.checked_out_at).getTime() - new Date(visit.checked_in_at).getTime())}`}
                </p>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapView>
  )
}
