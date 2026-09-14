import { Marker, Popup } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { MapView } from '@/features/maps/MapView'
import { pinIcon, STATUS_COLORS } from '@/features/maps/markers'
import { timeAgo } from '@/lib/datetime'
import { FLEET_STATUS_LABELS } from './FleetStatusBadge'
import type { FleetMemberSnapshot } from './types'

const COLOR_BY_STATUS = {
  VISITING: STATUS_COLORS.visiting,
  IDLING: STATUS_COLORS.idling,
  OFF: STATUS_COLORS.off,
} as const

export function FleetMap({
  snapshots,
  onSelect,
  height = 320,
}: {
  snapshots: FleetMemberSnapshot[]
  onSelect?: (memberId: string) => void
  height?: number | string
}) {
  const located = snapshots.filter((s) => s.lastLocation && s.status !== 'OFF')
  const points: LatLngExpression[] = located.map((s) => [s.lastLocation!.latitude, s.lastLocation!.longitude])

  if (located.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl2 bg-neutral-100 text-sm text-neutral-400" style={{ height }}>
        No one is on the road right now
      </div>
    )
  }

  return (
    <MapView points={points} height={height}>
      {located.map((s) => (
        <Marker
          key={s.member.id}
          position={[s.lastLocation!.latitude, s.lastLocation!.longitude]}
          icon={pinIcon(COLOR_BY_STATUS[s.status])}
          eventHandlers={onSelect ? { click: () => onSelect(s.member.id) } : undefined}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{s.member.fullName}</p>
              <p className="text-neutral-500">{FLEET_STATUS_LABELS[s.status]}</p>
              <p className="text-xs text-neutral-400">Updated {timeAgo(s.lastLocation!.at)}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapView>
  )
}
