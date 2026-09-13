import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapPin } from 'lucide-react'

/**
 * Colored pin icons built from inline SVG (no external marker image
 * assets to configure/bundle -- react-leaflet's default icon path is a
 * well-known bundler headache, so we sidestep it entirely).
 */
export function pinIcon(color: string, opts?: { size?: number; label?: string }): L.DivIcon {
  const size = opts?.size ?? 32
  const svg = renderToStaticMarkup(<MapPin color="white" fill={color} strokeWidth={1.5} size={size} />)
  return L.divIcon({
    className: '',
    html: `<div style="filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))">${svg}${
      opts?.label
        ? `<span style="position:absolute;top:${size * 0.16}px;left:0;width:${size}px;text-align:center;color:white;font-size:${
            size * 0.34
          }px;font-weight:700;">${opts.label}</span>`
        : ''
    }</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

export const STATUS_COLORS = {
  visiting: '#1d6fb8',
  idling: '#b48a5a',
  off: '#8a8f98',
  working: '#0f6e4f',
} as const
