import type { ReactNode } from 'react'

interface Props {
  /** 0-100. Purely a visual status indicator -- this app has no daily-hours target to measure against. */
  value: number
  size?: number
  strokeWidth?: number
  trackClassName?: string
  progressClassName?: string
  children?: ReactNode
}

/** Circular status ring used on the dashboard hero card. SVG, no dependency. */
export function ProgressRing({
  value,
  size = 72,
  strokeWidth = 6,
  trackClassName = 'stroke-white/15',
  progressClassName = 'stroke-earth-400',
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className={trackClassName} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${progressClassName}`}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}
