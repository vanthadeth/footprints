import L from 'leaflet'

/**
 * Colored pin icons built from a hand-drawn, genuinely solid teardrop path
 * (not lucide's MapPin, which is a stroke-based outline icon -- setting its
 * `fill` colors both the outer shape AND its inner "location dot" hole,
 * which reads as hollow/thin rather than a solid marker, and made a number
 * label overlaid there hard to read). No external marker image assets to
 * configure/bundle either way -- react-leaflet's default icon path is a
 * well-known bundler headache, so this sidesteps it entirely.
 */
export function pinIcon(color: string, opts?: { size?: number; label?: string }): L.DivIcon {
  const size = opts?.size ?? 32
  const height = (size * 32) / 24 // the teardrop path's viewBox is 24 wide by 32 tall
  const badgeR = (7.5 / 24) * size

  const svg = `
    <svg width="${size}" height="${height}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      ${opts?.label ? `<circle cx="12" cy="12" r="7.5" fill="white"/>` : ''}
    </svg>
  `.trim()

  const label = opts?.label
    ? `<span style="position:absolute;top:${size / 2}px;left:0;width:${size}px;text-align:center;transform:translateY(-50%);color:${color};font-size:${
        badgeR * 1.15
      }px;font-weight:700;line-height:1;">${opts.label}</span>`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;filter:drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))">${svg}${label}</div>`,
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height],
  })
}

export const STATUS_COLORS = {
  visiting: '#1d6fb8',
  idling: '#b48a5a',
  off: '#8a8f98',
  working: '#0f6e4f',
} as const
