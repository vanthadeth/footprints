import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getTileConfig } from './tileConfig'

const DEFAULT_CENTER: LatLngExpression = [11.5564, 104.9282] // Phnom Penh

export function MapView({
  points,
  height = 260,
  className = '',
  /** false for an edge-to-edge full-screen map, where rounded corners would leave a visible gap at the viewport edge. */
  rounded = true,
  children,
}: {
  /** Used to auto-fit the view. Pass an empty array to keep the default center/zoom. */
  points: LatLngExpression[]
  height?: number | string
  className?: string
  rounded?: boolean
  children?: React.ReactNode
}) {
  const tile = getTileConfig()

  return (
    <div
      className={`overflow-hidden ${rounded ? 'rounded-xl2' : ''} ${className}`}
      style={{ height, isolation: 'isolate' }}
    >
      <MapContainer center={DEFAULT_CENTER} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tile.url} attribution={tile.attribution} />
        <FitToPoints points={points} />
        {children}
      </MapContainer>
    </div>
  )
}

function FitToPoints({ points }: { points: LatLngExpression[] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 15)
      return
    }
    map.fitBounds(points as LatLngBoundsExpression, { padding: [32, 32], maxZoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the point set itself changes
  }, [JSON.stringify(points)])

  return null
}
