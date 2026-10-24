import { axisPercent, buildStrip, segmentTitle, type Minute, type StripDay } from './dayStrip'

interface Props {
  day: StripDay
  /** The axis always runs from the first to the last hour; defaults to 07:00-19:00. */
  axisStart?: Minute
  axisEnd?: Minute
  /** Dashed lines at the start and end of working hours. */
  shiftLines?: boolean
  /** Thinner bar for lists and team rows. */
  thin?: boolean
  className?: string
}

/**
 * The day as one bar: visits (short, good, long), travel, idle and not
 * clocked-in time on a working-hours axis. No card, marks, icons or numbers,
 * so it can sit in any section. Colours come from the --strip-* variables
 * in index.css (light and dark).
 */
export function DayStrip({ day, axisStart = 7 * 60, axisEnd = 19 * 60, shiftLines = false, thin = false, className = '' }: Props) {
  const segments = buildStrip(day, axisStart, axisEnd)
  const startPct = axisPercent(day.shiftStart, axisStart, axisEnd)
  const endPct = axisPercent(day.shiftEnd, axisStart, axisEnd)
  return (
    <div className={`day-strip ${thin ? 'h-[15px]' : 'h-[33px]'} ${className}`} role="img" aria-label="Day timeline">
      {/* Travel colour outside working hours. */}
      <div className="day-strip-seg day-strip-travel" style={{ left: 0, width: `${startPct}%` }} />
      <div className="day-strip-seg day-strip-travel" style={{ left: `${endPct}%`, right: 0 }} />
      {segments.map((s, i) => (
        <div
          key={i}
          className={`day-strip-seg day-strip-${s.kind}${s.flagged ? ' day-strip-flag' : ''}`}
          style={{ left: `${s.left}%`, width: `${s.width}%` }}
          title={segmentTitle(s)}
        />
      ))}
      {shiftLines && (
        <>
          <div className="day-strip-shift" style={{ left: `${startPct}%` }} />
          <div className="day-strip-shift" style={{ left: `${endPct}%` }} />
        </>
      )}
    </div>
  )
}
