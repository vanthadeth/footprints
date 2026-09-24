export interface Ring {
  /** 0-1; values above 1 are drawn as a full ring. */
  progress: number
  /** Hex colour -- the track is the same colour at low opacity. */
  color: string
}

/** Apple Fitness-style concentric progress rings (outermost first). SVG, no dependency. */
export function ActivityRings({ rings, size = 124, stroke = 11, label }: { rings: Ring[]; size?: number; stroke?: number; label: string }) {
  const gap = 3
  const center = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="shrink-0 -rotate-90">
      {rings.map((ring, i) => {
        const r = center - stroke / 2 - i * (stroke + gap)
        if (r <= 0) return null
        const c = 2 * Math.PI * r
        const p = Math.min(1, Math.max(0, ring.progress))
        return (
          <g key={i} fill="none" strokeWidth={stroke} strokeLinecap="round">
            <circle cx={center} cy={center} r={r} stroke={ring.color} strokeOpacity={0.18} />
            {p > 0 && (
              <circle
                cx={center}
                cy={center}
                r={r}
                stroke={ring.color}
                strokeDasharray={`${c * p} ${c}`}
                className="transition-[stroke-dasharray] duration-700 ease-out"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
