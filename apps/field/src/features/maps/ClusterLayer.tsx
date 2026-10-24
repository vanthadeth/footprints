import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { MAX_PINS, groupPoints } from './cluster'

export interface Segment {
  color: string
  count: number
}

const icons = new Map<string, L.DivIcon>()

/** A count bubble whose ring shows the mix of its members (e.g. visited / not / overdue). */
function bubbleIcon(count: number, segments: Segment[]): L.DivIcon {
  const parts = segments.filter((s) => s.count > 0)
  const key = `${count}|${parts.map((s) => `${s.color}:${s.count}`).join(',')}`
  const hit = icons.get(key)
  if (hit) return hit
  const size = Math.round(Math.min(56, 32 + Math.log10(count) * 10))
  const total = parts.reduce((n, s) => n + s.count, 0) || 1
  let at = 0
  const stops = parts.map((s) => {
    const from = (at / total) * 360
    at += s.count
    return `${s.color} ${from.toFixed(1)}deg ${((at / total) * 360).toFixed(1)}deg`
  })
  const ring = stops.length ? `conic-gradient(${stops.join(',')})` : '#006ACC'
  const label = count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count)
  const html = `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${ring};padding:4px;box-shadow:0 2px 6px rgba(0,0,0,.3)"><div style="width:100%;height:100%;border-radius:9999px;background:#fff;display:flex;align-items:center;justify-content:center;font:800 ${size >= 44 ? 13 : 12}px 'Google Sans',sans-serif;color:#1c1c1c">${label}</div></div>`
  const icon = L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] })
  icons.set(key, icon)
  return icon
}

/**
 * Draws many points without flooding the map: points in view (plus a
 * margin) that sit close together on screen become one count bubble, so
 * there are never more than `max` markers. A bubble zooms in to its
 * members when tapped; one whose members share a spot opens `renderGroup`
 * instead. Re-groups after every pan and zoom.
 */
export function ClusterLayer<T>({
  items,
  position,
  renderPin,
  segments,
  renderGroup,
  max = MAX_PINS,
  onGroup,
}: {
  items: T[]
  position: (item: T) => [number, number]
  renderPin: (item: T) => ReactNode
  segments: (items: T[]) => Segment[]
  renderGroup?: (items: T[]) => ReactNode
  max?: number
  /** Told how many markers and bubbles are on the map after each re-group. */
  onGroup?: (markers: number, bubbles: number) => void
}) {
  const map = useMap()
  const [view, setView] = useState(0)
  useMapEvents({ moveend: () => setView((n) => n + 1), zoomend: () => setView((n) => n + 1) })

  const groups = useMemo(() => {
    const zoom = map.getZoom()
    const bounds = map.getBounds().pad(0.25)
    const points = []
    for (const item of items) {
      const ll = L.latLng(position(item))
      if (!bounds.contains(ll)) continue
      const p = map.project(ll, zoom)
      points.push({ x: p.x, y: p.y, item })
    }
    return groupPoints(points, max).map((g) => ({ ...g, latlng: map.unproject([g.x, g.y], zoom) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `view` changes on every pan/zoom; `position` is read fresh
  }, [items, max, map, view])

  useEffect(() => {
    onGroup?.(groups.length, groups.filter((g) => g.items.length > 1).length)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report once per re-group
  }, [groups])

  return (
    <>
      {groups.map((g) => {
        if (g.items.length === 1) return renderPin(g.items[0])
        const spots = new Set(g.items.map((i) => position(i).map((n) => n.toFixed(5)).join(',')))
        const sameSpot = spots.size === 1
        return (
          <Marker
            key={`g:${Math.round(g.x)}:${Math.round(g.y)}`}
            position={g.latlng}
            icon={bubbleIcon(g.items.length, segments(g.items))}
            zIndexOffset={1000}
            title={`${g.items.length} here`}
            eventHandlers={
              sameSpot
                ? undefined
                : {
                    click: () => {
                      // Fit the members, but always step in at least two levels so a tap never feels like nothing happened.
                      const b = L.latLngBounds(g.items.map(position))
                      const zoom = Math.min(map.getMaxZoom(), Math.max(map.getBoundsZoom(b, false, L.point(96, 96)), map.getZoom() + 2))
                      map.setView(b.getCenter(), zoom)
                    },
                  }
            }
          >
            {sameSpot && renderGroup && <Popup>{renderGroup(g.items)}</Popup>}
          </Marker>
        )
      })}
    </>
  )
}
