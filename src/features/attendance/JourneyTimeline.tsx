import { type ReactNode, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Coffee,
  Coins,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MessageCircleQuestion,
  Pencil,
  RotateCcw,
  Save,
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
import { useJourneyContext } from './JourneyContext'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { GAP_FLAG_THRESHOLD_MINUTES } from '@/lib/config'
import { formatDate, formatDuration, formatTime } from '@/lib/datetime'
import { formatDistance } from '@/lib/geo'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { visitsService, type VisitOutcomeDetails } from '@/features/visits/visitsService'
import type { VisitOption, VisitOptionKind } from '@/features/visits/visitOptionsService'
import type { AttendanceRow, VisitRow } from './types'

const VISIT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

const NEXT_VISIT_PRESETS: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

interface Props {
  /** Every attendance session for the day, in any order -- multiple clock-in/clock-out cycles are allowed. */
  attendance: AttendanceRow[]
  visits: VisitRow[]
  customerNames: Record<string, string>
  /**
   * Enables edit/check-out/void actions in each visit's detail sheet.
   * Only for the signed-in user's own Footprints history -- never for a
   * supervisor's read-only glance at someone else's day (Fleet), which
   * doesn't pass this. Defaults to false.
   */
  interactive?: boolean
  /** Called after any successful edit/check-out/void/unvoid, so the page showing this timeline (a separate query, e.g. useJourneyHistory) knows to refetch. */
  onVisitChanged?: () => void
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
 *
 * A voided visit still renders here in its chronological slot (so it can
 * be found and restored) but is visually de-emphasized and excluded from
 * computeJourneyStats -- it never happened, for every count/duration/gap,
 * but the timeline itself is a literal record of the day, voided stops
 * included.
 */
export function JourneyTimeline({ attendance, visits, customerNames, interactive = false, onVisitChanged }: Props) {
  // Small, rarely-changing admin-managed lookup -- cheap to load here so
  // every caller (Footprints, Fleet's member detail) gets visit-record
  // icons (and, when interactive, the edit form's chip options) for free
  // rather than having to fetch and thread it through.
  const { byKind } = useVisitOptions()
  const optionsById: Record<string, VisitOption> = {}
  for (const options of Object.values(byKind)) {
    for (const o of options) optionsById[o.id] = o
  }
  const locationNames = useLocationNames(attendance.map((s) => s.clock_in_location_id))

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
      const locationName = event.session.clock_in_location_id ? locationNames[event.session.clock_in_location_id] : undefined
      rows.push(
        <ClockNode key={`in-${event.session.id}`} time={event.time} label="Clock In" toneClass="bg-status-working" locationName={locationName} />
      )
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
          byKind={byKind}
          interactive={interactive}
          onVisitChanged={onVisitChanged}
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

function ClockNode({ time, label, toneClass, locationName }: { time: string; label: string; toneClass: string; locationName?: string }) {
  return (
    <li className="relative flex items-center justify-between gap-3 py-0.5">
      <span className={`absolute -left-[2.875rem] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white ${toneClass}`}>
        <Clock className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
        {locationName && <p className="truncate text-xs text-neutral-400">{locationName}</p>}
      </div>
      <p className="shrink-0 text-sm font-bold text-neutral-900 dark:text-neutral-100">{formatTime(time)}</p>
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

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: VisitOption[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-3.5 py-2 text-sm font-medium tap-target ${
              value === o.id ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
            }`}
          >
            {o.label}
          </button>
        ))}
        {options.length === 0 && <p className="text-xs text-neutral-400">No options configured.</p>}
      </div>
    </div>
  )
}

function VisitEntry({
  visit,
  index,
  customerName,
  optionsById,
  byKind,
  interactive = false,
  onVisitChanged,
}: {
  visit: VisitRow
  index: number
  customerName: string | undefined
  optionsById: Record<string, VisitOption>
  byKind: Record<VisitOptionKind, VisitOption[]>
  interactive?: boolean
  onVisitChanged?: () => void
}) {
  const journey = useJourneyContext()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmCheckOutOpen, setConfirmCheckOutOpen] = useState(false)
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [visitTypeId, setVisitTypeId] = useState<string | null>(visit.visit_type_id)
  const [visitStatusId, setVisitStatusId] = useState<string | null>(visit.visit_status_id)
  const [orderStatusId, setOrderStatusId] = useState<string | null>(visit.order_status_id)
  const [paymentStatusId, setPaymentStatusId] = useState<string | null>(visit.payment_status_id)
  const [nextAppointment, setNextAppointment] = useState<string | null>(visit.next_appointment)
  const [customDate, setCustomDate] = useState('')
  const [remarks, setRemarks] = useState(visit.remarks ?? '')

  // Re-sync the edit buffer to the visit's latest saved values every time
  // the sheet (re)opens -- so a previous edit-then-cancel, or fresher data
  // from a parent refetch after some other change, never lingers as stale
  // form state.
  useEffect(() => {
    if (!open) return
    setEditing(false)
    setConfirmCheckOutOpen(false)
    setConfirmVoidOpen(false)
    setActionError(null)
    setVisitTypeId(visit.visit_type_id)
    setVisitStatusId(visit.visit_status_id)
    setOrderStatusId(visit.order_status_id)
    setPaymentStatusId(visit.payment_status_id)
    setNextAppointment(visit.next_appointment)
    setCustomDate('')
    setRemarks(visit.remarks ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when the sheet opens, not on every visit/prop change
  }, [open])

  const label = visit.customer_id ? customerName ?? 'Loading…' : 'Unassigned Visit'
  const closed = !!visit.checked_out_at
  const voided = !!visit.cancelled_at
  const duration = closed
    ? formatDuration(new Date(visit.checked_out_at!).getTime() - new Date(visit.checked_in_at).getTime())
    : 'In progress'
  const timeRange = `${formatTime(visit.checked_in_at)} → ${closed ? formatTime(visit.checked_out_at) : 'now'}`

  const visitStatus = visit.visit_status_id ? optionsById[visit.visit_status_id] : undefined
  const orderStatus = visit.order_status_id ? optionsById[visit.order_status_id] : undefined
  const paymentStatus = visit.payment_status_id ? optionsById[visit.payment_status_id] : undefined
  const hasRecord = visitStatus || orderStatus || paymentStatus || visit.next_appointment

  const isOpenVisit = interactive && !closed && !voided && visit.id === journey.openVisit?.id
  const withinEditWindow = Date.now() - new Date(visit.checked_in_at).getTime() < VISIT_EDIT_WINDOW_MS
  const canEditRecord = interactive && !voided && withinEditWindow
  const canVoid = interactive && !voided
  const canUnvoid = interactive && voided
  const showForm = isOpenVisit || (canEditRecord && editing)

  function pickNextVisit(days: number) {
    setNextAppointment(new Date(Date.now() + days * 86_400_000).toISOString())
    setCustomDate('')
  }

  function pickCustomDate(value: string) {
    setCustomDate(value)
    setNextAppointment(value ? new Date(`${value}T00:00:00`).toISOString() : null)
  }

  function currentDetails(): VisitOutcomeDetails {
    return { visitTypeId, visitStatusId, orderStatusId, paymentStatusId, nextAppointment, remarks: remarks.trim() || null }
  }

  function handleCancelEdit() {
    setEditing(false)
    setVisitTypeId(visit.visit_type_id)
    setVisitStatusId(visit.visit_status_id)
    setOrderStatusId(visit.order_status_id)
    setPaymentStatusId(visit.payment_status_id)
    setNextAppointment(visit.next_appointment)
    setCustomDate('')
    setRemarks(visit.remarks ?? '')
  }

  async function handleSaveRecord() {
    setBusy(true)
    setActionError(null)
    try {
      await visitsService.updateVisitRecord(visit.id, currentDetails())
      setEditing(false)
      journey.refresh()
      onVisitChanged?.()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  function handleCheckOut() {
    setConfirmCheckOutOpen(false)
    // journey.endVisit never throws (withBusyGuard swallows failures into
    // journey.error) -- refetch either way, a refetch after a failed
    // checkout is just a harmless no-op re-fetch of the same open visit.
    void journey.endVisit(currentDetails()).finally(() => onVisitChanged?.())
  }

  async function handleConfirmVoid() {
    setBusy(true)
    setActionError(null)
    try {
      await visitsService.voidVisit(visit.id)
      setConfirmVoidOpen(false)
      journey.refresh()
      onVisitChanged?.()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not void this visit.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnvoid() {
    setBusy(true)
    setActionError(null)
    try {
      await visitsService.unvoidVisit(visit.id)
      journey.refresh()
      onVisitChanged?.()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not restore this visit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="relative">
      <span
        className={`absolute -left-[2.875rem] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          voided ? 'bg-neutral-400 dark:bg-neutral-600' : 'bg-neutral-900 dark:bg-neutral-700'
        }`}
      >
        {visit.visit_number ?? index + 1}
      </span>
      <button
        onClick={() => setOpen(true)}
        className={`flex w-full items-start justify-between gap-3 rounded-xl2 border bg-white p-4 text-left shadow-card tap-target dark:bg-neutral-900 ${
          voided ? 'border-dashed border-neutral-300 opacity-60 dark:border-neutral-600' : 'border-neutral-200 dark:border-neutral-700'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
            <span className={voided ? 'line-through' : undefined}>{label}</span>
            {voided && <span className="rounded-full bg-status-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-status-danger">VOIDED</span>}
            {!voided && closed && !visit.auto_closed && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-status-working/10 px-1.5 py-0.5 text-[10px] font-medium text-status-working">
                <Check className="h-2.5 w-2.5" /> Done
              </span>
            )}
            {!voided && visit.auto_closed && (
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
          {journey.error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{journey.error}</p>}
          {actionError && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{actionError}</p>}

          {voided && (
            <div className="rounded-xl2 border border-status-danger/30 bg-status-danger/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-status-danger">
                <Ban className="h-4 w-4" /> This visit was voided
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {visit.cancel_reason} · {formatDate(visit.cancelled_at)} at {formatTime(visit.cancelled_at)}
              </p>
              {canUnvoid && (
                <button
                  onClick={handleUnvoid}
                  disabled={busy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white tap-target disabled:opacity-60 dark:bg-white dark:text-neutral-900"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {busy ? 'Restoring…' : 'Restore Visit'}
                </button>
              )}
            </div>
          )}

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

          {!voided &&
            (showForm ? (
              <div className="space-y-4">
                <ChipGroup label="Type of Visit (optional)" options={byKind.visit_type} value={visitTypeId} onChange={setVisitTypeId} />
                <ChipGroup label="Visit Status (optional)" options={byKind.visit_status} value={visitStatusId} onChange={setVisitStatusId} />
                <ChipGroup label="Order Status (optional)" options={byKind.order_status} value={orderStatusId} onChange={setOrderStatusId} />
                <ChipGroup
                  label="Payment Status (optional)"
                  options={byKind.payment_status}
                  value={paymentStatusId}
                  onChange={setPaymentStatusId}
                />

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Next Visit (optional)</p>
                  <div className="flex flex-wrap gap-2">
                    {NEXT_VISIT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => pickNextVisit(preset.days)}
                        className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600 tap-target"
                      >
                        {preset.label}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => pickCustomDate(e.target.value)}
                      className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600"
                    />
                  </div>
                  {nextAppointment && <p className="mt-2 text-xs text-neutral-500">Scheduled: {formatDate(nextAppointment)}</p>}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Remarks (optional)</p>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    placeholder="Anything worth noting about this visit…"
                    className="w-full rounded-xl2 border border-neutral-200 bg-white p-3 text-sm text-neutral-900 placeholder:text-neutral-400"
                  />
                </div>

                {isOpenVisit ? (
                  <button
                    onClick={() => setConfirmCheckOutOpen(true)}
                    disabled={journey.busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60 dark:bg-white dark:text-neutral-900"
                  >
                    {journey.busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {journey.busy ? 'Checking out…' : 'CHECK OUT'}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEdit}
                      disabled={busy}
                      className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 tap-target disabled:opacity-60 dark:border-neutral-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveRecord}
                      disabled={busy}
                      className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {busy ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {hasRecord ? (
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
                ) : (
                  canEditRecord && <p className="text-center text-xs text-neutral-400">No visit record set yet.</p>
                )}

                {canEditRecord && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 tap-target dark:border-neutral-700"
                  >
                    <Pencil className="h-4 w-4" /> {hasRecord ? 'Edit Record' : 'Add Record'}
                  </button>
                )}
              </>
            ))}

          {canVoid && !showForm && (
            <button
              onClick={() => setConfirmVoidOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-status-danger/30 py-3 text-sm font-semibold text-status-danger tap-target"
            >
              <Ban className="h-4 w-4" /> Void Visit
            </button>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={confirmCheckOutOpen} onClose={() => setConfirmCheckOutOpen(false)} title="Confirm Check Out">
        <div className="p-4">
          <p className="text-sm text-neutral-600">You're about to check out of {label}. This can't be undone -- make sure you're ready.</p>
          <button
            onClick={handleCheckOut}
            disabled={journey.busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {journey.busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {journey.busy ? 'Checking out…' : 'Yes, Check Out'}
          </button>
          <button
            onClick={() => setConfirmCheckOutOpen(false)}
            className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmVoidOpen} onClose={() => setConfirmVoidOpen(false)} title="Void This Visit?">
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            {label} will be marked voided and excluded from your stats. You can restore it later from here if this was a mistake.
          </p>
          <button
            onClick={handleConfirmVoid}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-status-danger py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {busy ? 'Voiding…' : 'Void Visit'}
          </button>
          <button
            onClick={() => setConfirmVoidOpen(false)}
            className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    </li>
  )
}
