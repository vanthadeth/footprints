import { Banknote, CalendarDays, CircleCheck, Flag } from 'lucide-react'
import { axisPercent, buildMarks, buildPins, buildStrip, segmentTitle, type Minute, type StripDay, type StripIcon } from './dayStrip'

interface Props {
  day: StripDay
  /** The axis always runs from the first to the last hour; defaults to 07:00-19:00. */
  axisStart?: Minute
  axisEnd?: Minute
  /** Dashed lines at the start and end of working hours. */
  shiftLines?: boolean
  /** Thinner bar for lists and team rows. */
  thin?: boolean
  /** A flag above the strip for each far-away visit, and visit icons below it. */
  indicators?: boolean
  className?: string
}

const ICON: Record<StripIcon, { Icon: typeof CircleCheck; tone: string; label: string }> = {
  ordered: { Icon: CircleCheck, tone: 'day-strip-tone-muted', label: 'Ordered' },
  confirmed: { Icon: CircleCheck, tone: 'day-strip-tone-brand', label: 'Order confirmed' },
  collection: { Icon: Banknote, tone: 'day-strip-tone-ok', label: 'Collection' },
  appointment: { Icon: CalendarDays, tone: 'day-strip-tone-amber', label: 'Appointment' },
}

/**
 * The day as one bar: visits (short, good, long), travel, idle and not
 * clocked-in time on a working-hours axis. By default no card, marks, icons
 * or numbers, so it can sit in any section; `indicators` adds the far-away
 * flags above and the order / collection / appointment icons below. Colours come from the --strip-* variables in
 * styles.css (light and dark).
 */
export function DayStrip({ day, axisStart = 7 * 60, axisEnd = 19 * 60, shiftLines = false, thin = false, indicators = false, className = '' }: Props) {
  const segments = buildStrip(day, axisStart, axisEnd)
  const marks = indicators ? buildMarks(day, axisStart, axisEnd) : []
  const startPct = axisPercent(day.shiftStart, axisStart, axisEnd)
  const endPct = axisPercent(day.shiftEnd, axisStart, axisEnd)
  return (
    <div className={className}>
      {marks.length > 0 && (
        <div className="day-strip-marks">
          {marks.map((m, i) => (
            <div key={i} className="day-strip-mark day-strip-mark-flag" style={{ left: `${m.left}%` }}>
              <Flag role="img" aria-label={m.label} size={14} strokeWidth={2.4} />
              <i />
            </div>
          ))}
        </div>
      )}
      <div className={`day-strip ${thin ? 'h-[15px]' : indicators ? 'h-[22px]' : 'h-[33px]'}`} role="img" aria-label="Day timeline">
        {/* Working hours have a light background for the time nothing fills; outside them the bar is striped, with no background. */}
        <div className="day-strip-work" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
        <div className="day-strip-seg day-strip-outside" style={{ left: 0, width: `${startPct}%` }} />
        <div className="day-strip-seg day-strip-outside" style={{ left: `${endPct}%`, right: 0 }} />
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
      {indicators && (
        <div className="day-strip-pins">
          {buildPins(day, axisStart, axisEnd).map((p, i) => (
            <div key={i} className="day-strip-pin" style={{ left: `${p.left}%` }}>
              {p.icons.map((k, j) => {
                const { Icon, tone, label } = ICON[k]
                return (
                  <span key={j} className={`day-strip-pi ${tone}`}>
                    <Icon role="img" aria-label={label} size={15} strokeWidth={2.4} />
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
