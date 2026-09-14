import { type ReactNode, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Coffee,
  Coins,
  Link2,
  LogIn,
  LogOut,
  MapPin,
  MessageCircleQuestion,
  ShoppingCart,
  Store,
  Tag,
  Timer,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { GAP_FLAG_THRESHOLD_MINUTES } from '@/lib/config'
import { formatDate, formatDuration, formatTime } from '@/lib/datetime'
import { formatDistance } from '@/lib/geo'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import type { VisitOption } from '@/features/visits/visitOptionsService'
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
  // Small, rarely-changing admin-managed lookup -- cheap to load here so
  // every caller (Footprints, Fleet's member detail) gets visit-record
  // icons for free rather than having to fetch and thread it through.
  const { byKind } = useVisitOptions()
  const optionsById: Record<string, VisitOption> = {}
  for (const options of Object.values(byKind)) {
    for (const o of options) optionsById[o.id] = o
  }

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
          optionsById={optionsById}
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

/** A base icon with a diagonal "not/none" slash drawn over it -- one visual
 * language for every negative visit-record state (Nobody, Shop Closed, No
 * Order) instead of mixing an X-mark icon here and a slash there. */
function SlashedIcon({ icon: Icon, className = 'h-4 w-4' }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <Icon className="h-full w-full" />
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full">
        <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/** Matches by the option's own label text (admin-configurable, so this is
 * best-effort) -- an unrecognised label still gets a sensible generic tag
 * rather than nothing. */
function visitStatusIcon(label: string): ReactNode {
  const key = label.trim().toLowerCase()
  if (key === 'owner') return <User className="h-4 w-4" />
  if (key === 'staff') return <Users className="h-4 w-4" />
  if (key === 'nobody') return <SlashedIcon icon={User} />
  if (key.startsWith('shop clos')) return <SlashedIcon icon={Store} />
  return <Tag className="h-4 w-4" />
}

function orderStatusIcon(label: string): ReactNode {
  const key = label.trim().toLowerCase()
  if (key === 'ordered') return <ShoppingCart className="h-4 w-4" />
  if (key === 'no order') return <SlashedIcon icon={ShoppingCart} />
  if (key === 'will order') return <MessageCircleQuestion className="h-4 w-4" />
  return <Tag className="h-4 w-4" />
}

function paymentStatusIcon(label: string): ReactNode {
  const key = label.trim().toLowerCase()
  if (key.includes('full')) return <Wallet className="h-4 w-4" />
  if (key.includes('part')) return <Coins className="h-4 w-4" />
  if (key.includes('refuse')) return <AlertTriangle className="h-4 w-4" />
  return <Tag className="h-4 w-4" />
}

function RecordRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
        {icon}
      </span>
      <p className="min-w-0 flex-1 truncate text-xs text-neutral-400">{label}</p>
      <p className="shrink-0 text-xs font-semibold text-neutral-800 dark:text-neutral-200">{value}</p>
    </div>
  )
}

function VisitEntry({
  visit,
  index,
  customerName,
  optionsById,
}: {
  visit: VisitRow
  index: number
  customerName: string | undefined
  optionsById: Record<string, VisitOption>
}) {
  const [open, setOpen] = useState(false)
  const label = visit.customer_id ? customerName ?? 'Loading…' : 'Unassigned Visit'
  const closed = !!visit.checked_out_at
  const duration = closed
    ? formatDuration(new Date(visit.checked_out_at!).getTime() - new Date(visit.checked_in_at).getTime())
    : 'In progress'
  const timeRange = `${formatTime(visit.checked_in_at)} → ${closed ? formatTime(visit.checked_out_at) : 'now'}`

  const visitStatus = visit.visit_status_id ? optionsById[visit.visit_status_id] : undefined
  const orderStatus = visit.order_status_id ? optionsById[visit.order_status_id] : undefined
  const paymentStatus = visit.payment_status_id ? optionsById[visit.payment_status_id] : undefined
  const hasRecord = visitStatus || orderStatus || paymentStatus || visit.next_appointment

  return (
    <li className="relative">
      <span className="absolute -left-[2.875rem] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white dark:bg-neutral-700">
        {visit.visit_number ?? index + 1}
      </span>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-start justify-between gap-3 rounded-xl2 border border-neutral-200 bg-white p-4 text-left shadow-card tap-target dark:border-neutral-700 dark:bg-neutral-900"
      >
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
          <p className="mt-1 font-mono text-xs text-neutral-400">{timeRange}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className={`text-sm font-bold ${visit.out_of_range ? 'text-status-warn' : 'text-earth-500'}`}>{duration}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Duration</p>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="space-y-3 p-4">
          <div className="rounded-xl2 border border-neutral-200 p-3 dark:border-neutral-700">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-working/10 text-status-working">
                  <LogIn className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Check In</p>
                  <p className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">{formatTime(visit.checked_in_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-visiting/10 text-status-visiting">
                  <LogOut className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Check Out</p>
                  <p className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {visit.checked_out_at ? formatTime(visit.checked_out_at) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl2 border border-neutral-200 p-3 dark:border-neutral-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <Timer className="h-3.5 w-3.5 text-earth-500" /> Visit Duration:{' '}
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{duration}</span>
              </p>
              <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <MapPin className={`h-3.5 w-3.5 ${visit.out_of_range ? 'text-status-warn' : 'text-status-working'}`} /> Distance:{' '}
                <span className={`font-semibold ${visit.out_of_range ? 'text-status-warn' : 'text-neutral-800 dark:text-neutral-200'}`}>
                  {formatDistance(visit.distance_m)}
                  {visit.out_of_range && ' · Flagged'}
                </span>
              </p>
            </div>
          </div>

          {hasRecord && (
            <div className="space-y-2.5 rounded-xl2 border border-neutral-200 p-3 dark:border-neutral-700">
              {visitStatus && <RecordRow icon={visitStatusIcon(visitStatus.label)} label="Visit Status" value={visitStatus.label} />}
              {orderStatus && <RecordRow icon={orderStatusIcon(orderStatus.label)} label="Order Status" value={orderStatus.label} />}
              {paymentStatus && (
                <RecordRow icon={paymentStatusIcon(paymentStatus.label)} label="Payment Status" value={paymentStatus.label} />
              )}
              {visit.next_appointment && (
                <RecordRow icon={<Calendar className="h-4 w-4" />} label="Next Visit" value={formatDate(visit.next_appointment)} />
              )}
            </div>
          )}
        </div>
      </BottomSheet>
    </li>
  )
}
