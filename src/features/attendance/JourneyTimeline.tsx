import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, Clock, Coffee, Link2 } from 'lucide-react'
import { GAP_FLAG_THRESHOLD_MINUTES } from '@/lib/config'
import { formatDuration, formatTime } from '@/lib/datetime'
import { formatDistance } from '@/lib/geo'
import type { AttendanceRow, VisitRow } from './types'

interface Props {
  /** Every attendance session for the day, in any order -- multiple clock-in/clock-out cycles are allowed. */
  attendance: AttendanceRow[]
  visits: VisitRow[]
  customerNames: Record<string, string>
}

type TimelineEvent =
  | { kind: 'clock-in'; time: string; session: AttendanceRow }
  | { kind: 'clock-out'; time: string; session: AttendanceRow }
  | { kind: 'visit'; time: string; visit: VisitRow; index: number }

/**
 * Attendance and visit events on one chronological rail, but always
 * visually distinguishable (spec §28): clock-in/out get a filled icon
 * node (green for in, earth for out), each visit a numbered dark node, and
 * a transit/gap a small outlined node -- so the node shape alone tells you
 * what kind of entry it is, before reading anything. Every node lines up
 * on the same vertical rail (each is centered on its own <li> regardless
 * of that row's height) and each visit is wrapped in its own card so a day
 * with several visits still reads as distinct events instead of one dense
 * block.
 *
 * A day can have more than one clock-in/clock-out pair -- multiple
 * sessions (a lunch break, a split shift) are allowed. Events from every
 * session merge into one flat, chronological list rather than one rail
 * per session, with a gap entry between every pair of consecutive events.
 * A gap that falls between a clock-out and the next clock-in is "off the
 * clock" -- shown distinctly and never flagged, since time away between
 * shifts is expected, unlike a long gap while actually clocked in
 * (flagged once it runs long, GAP_FLAG_THRESHOLD_MINUTES, same as an
 * over-distance visit is flagged in its expanded detail).
 */
export function JourneyTimeline({ attendance, visits, customerNames }: Props) {
  if (attendance.length === 0) return null

  const events: TimelineEvent[] = []
  for (const session of attendance) {
    events.push({ kind: 'clock-in', time: session.clock_in_at, session })
    if (session.clock_out_at) events.push({ kind: 'clock-out', time: session.clock_out_at, session })
  }
  const sortedVisits = [...visits].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
  sortedVisits.forEach((visit, index) => events.push({ kind: 'visit', time: visit.checked_in_at, visit, index }))
  events.sort((a, b) => a.time.localeCompare(b.time))

  const rows: ReactNode[] = []
  let cursor: string | null = null
  let cursorWasClockOut = false

  for (const event of events) {
    if (cursor) {
      const gapMs = gapBetween(cursor, event.time)
      if (gapMs != null) {
        rows.push(
          <GapEntry
            key={`gap-before-${event.kind}-${event.time}`}
            ms={gapMs}
            offClock={cursorWasClockOut && event.kind === 'clock-in'}
          />
        )
      }
    }

    if (event.kind === 'clock-in') {
      rows.push(<ClockNode key={`in-${event.session.id}`} time={event.time} label="Clock In" toneClass="bg-status-working" />)
      cursor = event.time
      cursorWasClockOut = false
    } else if (event.kind === 'clock-out') {
      rows.push(<ClockNode key={`out-${event.session.id}`} time={event.time} label="Clock Out" toneClass="bg-earth-500" />)
      cursor = event.time
      cursorWasClockOut = true
    } else {
      rows.push(
        <VisitEntry
          key={event.visit.id}
          visit={event.visit}
          index={event.index}
          customerName={event.visit.customer_id ? customerNames[event.visit.customer_id] : undefined}
        />
      )
      cursor = event.visit.checked_out_at
      cursorWasClockOut = false
    }
  }

  return <ol className="relative ml-3 space-y-3 border-l-2 border-neutral-100 pl-8 dark:border-neutral-700">{rows}</ol>
}

/** Gap between two ISO timestamps in ms, or null if either is missing or the gap isn't positive (nothing to show). */
function gapBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return ms > 0 ? ms : null
}

function ClockNode({ time, label, toneClass }: { time: string; label: string; toneClass: string }) {
  return (
    <li className="relative flex items-center justify-between gap-3 py-0.5">
      <span className={`absolute -left-[2.875rem] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white ${toneClass}`}>
        <Clock className="h-3.5 w-3.5" />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{formatTime(time)}</p>
    </li>
  )
}

function GapEntry({ ms, offClock = false }: { ms: number; offClock?: boolean }) {
  const flagged = !offClock && ms / 60_000 > GAP_FLAG_THRESHOLD_MINUTES
  return (
    <li className="relative flex items-center justify-between gap-3 py-0.5">
      <span
        className={`absolute -left-[2.75rem] top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white dark:bg-neutral-900 ${
          flagged ? 'border-status-warn' : 'border-neutral-200 dark:border-neutral-700'
        }`}
      >
        {offClock ? (
          <Coffee className="h-3 w-3 text-neutral-400" />
        ) : (
          <Link2 className={`h-3 w-3 ${flagged ? 'text-status-warn' : 'text-neutral-400'}`} />
        )}
      </span>
      <p className={`text-xs ${flagged ? 'font-medium text-status-warn' : 'text-neutral-400'}`}>
        {offClock ? 'Off the Clock' : 'Transit / Gap / Rest'}
      </p>
      <span className="flex shrink-0 items-center gap-1.5">
        {flagged && <span className="rounded-full bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warn">Flagged</span>}
        <span className={`text-xs font-medium ${flagged ? 'text-status-warn' : 'text-neutral-400'}`}>{formatDuration(ms)}</span>
      </span>
    </li>
  )
}

function VisitEntry({
  visit,
  index,
  customerName,
}: {
  visit: VisitRow
  index: number
  customerName: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const label = visit.customer_id ? customerName ?? 'Loading…' : 'Unassigned Visit'
  const closed = !!visit.checked_out_at
  const duration = closed
    ? formatDuration(new Date(visit.checked_out_at!).getTime() - new Date(visit.checked_in_at).getTime())
    : 'In progress'
  const timeRange = `${formatTime(visit.checked_in_at)} → ${closed ? formatTime(visit.checked_out_at) : 'now'}`

  return (
    <li className="relative">
      <span className="absolute -left-[2.875rem] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white dark:bg-neutral-700">
        {visit.visit_number ?? index + 1}
      </span>
      <div className="rounded-xl2 bg-neutral-50 dark:bg-neutral-800">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left tap-target">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
              {label}
              {closed && !visit.auto_closed && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-status-working/10 px-1.5 py-0.5 text-[10px] font-medium text-status-working">
                  <Check className="h-2.5 w-2.5" /> Done
                </span>
              )}
              {visit.auto_closed && (
                <span className="rounded-full bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warn">AUTO</span>
              )}
            </p>
            <p className="mt-1 text-xs text-neutral-400">{timeRange}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="text-right">
              <p className={`text-sm font-bold ${visit.out_of_range ? 'text-status-warn' : 'text-earth-500'}`}>{duration}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Duration</p>
            </div>
            {open ? (
              <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />
            ) : (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />
            )}
          </div>
        </button>

        {open && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-neutral-200 px-3.5 py-3 text-xs dark:border-neutral-700">
            <div>
              <p className="text-neutral-400">Check In</p>
              <p className="mt-0.5 font-medium text-neutral-800 dark:text-neutral-200">{formatTime(visit.checked_in_at)}</p>
            </div>
            <div>
              <p className="text-neutral-400">Check Out</p>
              <p className="mt-0.5 font-medium text-neutral-800 dark:text-neutral-200">
                {visit.checked_out_at ? formatTime(visit.checked_out_at) : '—'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-neutral-400">Distance</p>
              <p className={`mt-0.5 font-medium ${visit.out_of_range ? 'text-status-warn' : 'text-neutral-800 dark:text-neutral-200'}`}>
                {formatDistance(visit.distance_m)}
                {visit.out_of_range && ' · Flagged'}
              </p>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}
