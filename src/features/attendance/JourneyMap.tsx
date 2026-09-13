import { Marker, Polyline, Popup } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { formatDuration, formatTime } from '@/lib/datetime'
import type { VisitRow } from './types'

/**
 * Personal journey map: each visit as a numbered pin, connected
 * chronologically (spec §32). Visits with no recorded position (shouldn't
 * happen -- GPS is required at check-in -- but defends against bad data)
 * are simply skipped rather than crashing the map.
 */
export function JourneyMap({ visits, customerNames }: { visits: VisitRow[]; customerNames: Record<string, string> }) {
  const sorted = [...visits]
    .filter((v) => v.in_latitude != null && v.in_longitude != null)
    .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))

  const points: LatLngExpression[] = sorted.map((v) => [v.in_latitude!, v.in_longitude!])

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl2 bg-neutral-100 text-sm text-neutral-400">
        No visit locations yet
      </div>
    )
  }

  return (
    <MapView points={points}>
      {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#0f6e4f', weight: 3, opacity: 0.6 }} />}
      {sorted.map((visit, i) => (
        <Marker key={visit.id} position={[visit.in_latitude!, visit.in_longitude!]} icon={pinIcon('#0f6e4f', { label: String(i + 1) })}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">Visit #{visit.visit_number ?? i + 1}</p>
              <p>{visit.customer_id ? customerNames[visit.customer_id] ?? 'Loading…' : 'Unassigned'}</p>
              <p className="text-neutral-500">
                {formatTime(visit.checked_in_at)}
                {visit.checked_out_at &&
                  ` · ${formatDuration(new Date(visit.checked_out_at).getTime() - new Date(visit.checked_in_at).getTime())}`}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapView>
  )
}
