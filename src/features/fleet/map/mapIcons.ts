import L from 'leaflet'

/** Escapes text for use inside a divIcon's HTML string. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Life360-style person marker: initials in a status-coloured ring, a pointer, and an age badge underneath. */
export function personIcon(opts: { initials: string; color: string; age: string; stale: boolean; selected: boolean; dim: boolean }): L.DivIcon {
  const ring = opts.selected ? `box-shadow:0 0 0 5px rgba(22,104,184,.35),0 2px 6px rgba(0,0,0,.3);` : 'box-shadow:0 2px 6px rgba(0,0,0,.3);'
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;opacity:${opts.dim ? 0.75 : 1}">
      <div style="width:40px;height:40px;border-radius:9999px;background:#fff;border:3px ${opts.stale ? 'dashed' : 'solid'} ${opts.color};${ring}display:flex;align-items:center;justify-content:center;font:800 12.5px -apple-system,Segoe UI,Roboto,sans-serif;color:#171b25">${esc(opts.initials)}</div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${opts.color};margin-top:-1px"></div>
      <div style="margin-top:1px;padding:1px 5px;border-radius:6px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);font:800 9.5px -apple-system,Segoe UI,Roboto,sans-serif;white-space:nowrap;color:${opts.stale ? '#b8590f' : '#525a6a'}">${esc(opts.age)}</div>
    </div>`
  return L.divIcon({ className: '', html, iconSize: [44, 66], iconAnchor: [22, 50], popupAnchor: [0, -50] })
}

/** A route stop: numbered visit circle, IN/OUT squares for the clock, an idle marker. */
export function stopIcon(opts: { label: string; color: string; square: boolean; selected: boolean }): L.DivIcon {
  const size = opts.selected ? 34 : 28
  const html = `<div style="width:${size}px;height:${size}px;border-radius:${opts.square ? '8px' : '9999px'};background:${opts.color};border:3px solid ${
    opts.selected ? '#1668b8' : '#fff'
  };box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font:800 11px -apple-system,Segoe UI,Roboto,sans-serif">${esc(opts.label)}</div>`
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] })
}
