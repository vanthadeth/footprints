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
  Phone,
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
import { Circle, Marker } from 'react-leaflet'
import { BottomSheet } from '@/components/BottomSheet'
import { useLanguage } from '@/i18n/LanguageContext'
import { useJourneyContext } from './JourneyContext'
import { useLocationNames } from '@/features/locations/useLocationNames'
import { useLocationDetails, type LocationDetail } from '@/features/locations/useLocationDetails'
import { usePhoneNumbers } from './usePhoneNumbers'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { attendanceService } from './attendanceService'
import { GAP_FLAG_MAX_DISTANCE_METERS, GAP_FLAG_THRESHOLD_MINUTES, MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS } from '@/lib/config'
import { formatDate, formatDuration, formatTime } from '@/lib/datetime'
import { distanceInMeters, formatDistance } from '@/lib/geo'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { visitsService, type VisitOutcomeDetails } from '@/features/visits/visitsService'
import type { VisitOption, VisitOptionKind } from '@/features/visits/visitOptionsService'
import type { AttendanceRow, VisitRow } from './types'

const VISIT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

const NEXT_VISIT_PRESETS: { key: string; days: number }[] = [
  { key: 'journey.tomorrow', days: 1 },
  { key: 'journey.in3Days', days: 3 },
  { key: 'journey.nextWeek', days: 7 },
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
 * shifts is expected, unlike a long gap while actually clocked in (flagged
 * once it runs long, GAP_FLAG_THRESHOLD_MINUTES, AND the straight-line
 * distance between the gap's two endpoints is short, GAP_FLAG_MAX_DISTANCE_METERS
 * -- a long gap with real travel distance behind it isn't flagged, only one
 * that looks like idle/rest passed off as transit).
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
  const { t } = useLanguage()
  const { byKind } = useVisitOptions()
  const optionsById: Record<string, VisitOption> = {}
  for (const options of Object.values(byKind)) {
    for (const o of options) optionsById[o.id] = o
  }
  const locationNames = useLocationNames(attendance.map((s) => s.clock_in_location_id))
  const locationDetails = useLocationDetails(attendance.flatMap((s) => [s.clock_in_location_id, s.clock_out_location_id]))
  const phoneNumbers = usePhoneNumbers(attendance.map((s) => s.user_id))

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
  let cursorLocation: LatLng | null = null
  let cursorWasClockOut = false

  for (const event of events) {
    if (cursor) {
      const gapMs = gapBetween(cursor, event.time)
      if (gapMs != null) {
        const arrival = arrivalLocationOf(event)
        const distanceMeters = cursorLocation && arrival ? distanceInMeters(cursorLocation.lat, cursorLocation.lng, arrival.lat, arrival.lng) : null
        rows.push(
          <GapEntry
            key={`gap-before-${event.kind}-${event.time}`}
            ms={gapMs}
            distanceMeters={distanceMeters}
            offClock={cursorWasClockOut && event.kind === 'clock-in'}
          />
        )
      }
    }

    if (event.kind === 'clock-in') {
      const locationName = event.session.clock_in_location_id ? locationNames[event.session.clock_in_location_id] : undefined
      rows.push(
        <ClockEntry
          key={`in-${event.session.id}`}
          time={event.time}
          label={t('nav.clockIn')}
          toneClass="bg-status-working"
          locationName={locationName}
          phone={phoneNumbers[event.session.user_id] ?? null}
          latitude={event.session.clock_in_latitude}
          longitude={event.session.clock_in_longitude}
          selfiePath={event.session.clock_in_selfie_path}
          accuracyM={event.session.clock_in_accuracy_m}
          location={event.session.clock_in_location_id ? locationDetails[event.session.clock_in_location_id] : undefined}
        />
      )
      cursor = event.time
      cursorLocation = latLng(event.session.clock_in_latitude, event.session.clock_in_longitude)
      cursorWasClockOut = false
    } else if (event.kind === 'clock-out') {
      rows.push(
        <ClockEntry
          key={`out-${event.session.id}`}
          time={event.time}
          label={t('common.clockOut')}
          toneClass="bg-earth-500"
          phone={phoneNumbers[event.session.user_id] ?? null}
          latitude={event.session.clock_out_latitude}
          longitude={event.session.clock_out_longitude}
          selfiePath={event.session.clock_out_selfie_path}
          accuracyM={event.session.clock_out_accuracy_m}
          location={event.session.clock_out_location_id ? locationDetails[event.session.clock_out_location_id] : undefined}
        />
      )
      cursor = event.time
      cursorLocation = latLng(event.session.clock_out_latitude, event.session.clock_out_longitude)
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
      cursorLocation = event.visit.checked_out_at ? latLng(event.visit.out_latitude, event.visit.out_longitude) : null
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

interface LatLng {
  lat: number
  lng: number
}

function latLng(lat: number | null, lng: number | null): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null
}

/** The point an event is "arriving at" -- the far end of the gap immediately before it. */
function arrivalLocationOf(event: TimelineEvent): LatLng | null {
  if (event.kind === 'clock-in') return latLng(event.session.clock_in_latitude, event.session.clock_in_longitude)
  if (event.kind === 'clock-out') return latLng(event.session.clock_out_latitude, event.session.clock_out_longitude)
  return latLng(event.visit.in_latitude, event.visit.in_longitude)
}

function ClockEntry({
  time,
  label,
  toneClass,
  locationName,
  phone,
  latitude,
  longitude,
  selfiePath,
  accuracyM,
  location,
}: {
  time: string
  label: string
  toneClass: string
  locationName?: string
  phone: string | null
  latitude: number | null
  longitude: number | null
  selfiePath: string | null
  accuracyM: number | null
  location: LocationDetail | undefined
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [selfieLoading, setSelfieLoading] = useState(false)

  useEffect(() => {
    if (!open || !selfiePath) return
    let cancelled = false
    setSelfieLoading(true)
    attendanceService
      .getSelfieUrl(selfiePath)
      .then((url) => {
        if (!cancelled) setSelfieUrl(url)
      })
      .finally(() => {
        if (!cancelled) setSelfieLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selfiePath])

  const distanceMeters =
    latitude != null && longitude != null && location ? distanceInMeters(latitude, longitude, location.latitude, location.longitude) : null
  const lowAccuracy = accuracyM != null && accuracyM > MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS

  return (
    <li className="relative py-0.5">
      <span className={`absolute -left-[2.875rem] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white ${toneClass}`}>
        <Clock className="h-3.5 w-3.5" />
      </span>
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-3 tap-target">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
          {locationName && <p className="truncate text-xs text-neutral-400">{locationName}</p>}
        </div>
        <p className="shrink-0 text-sm font-bold text-neutral-900 dark:text-neutral-100">{formatTime(time)}</p>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="space-y-3 p-4">
          {selfiePath && (
            <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl2 bg-neutral-100 dark:bg-neutral-800">
              {selfieLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              ) : selfieUrl ? (
                <img src={selfieUrl} alt={label} className="h-full w-full object-cover" />
              ) : (
                <p className="text-xs text-neutral-400">{t('journey.noPhoto')}</p>
              )}
            </div>
          )}

          {latitude != null && longitude != null && (
            <MapView points={[[latitude, longitude]]} height={160}>
              <Marker position={[latitude, longitude]} icon={pinIcon(toneClass.includes('working') ? '#0f6e4f' : '#b8590f')} />
              {location && <Circle center={[location.latitude, location.longitude]} radius={location.radiusM} pathOptions={{ color: '#1668b8' }} />}
            </MapView>
          )}
          {latitude != null && longitude != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
              target="_blank"
              rel="noopener"
              className="block text-center text-xs font-medium text-brand-600 tap-target"
            >
              {t('journey.openInMaps')}
            </a>
          )}

          <div className="rounded-xl2 border border-neutral-200 p-3 dark:border-neutral-700">
            <Row label={t('journey.presetLocation')} value={location?.name ?? t('journey.noLocationMatched')} />
            <Row
              label={t('journey.accuracy')}
              value={accuracyM != null ? formatDistance(accuracyM) : '—'}
              warn={lowAccuracy}
              flagged={lowAccuracy}
            />
            {location && <Row label={t('journey.distance')} value={formatDistance(distanceMeters)} />}
          </div>

          <a
            href={phone ? `tel:${phone}` : undefined}
            aria-disabled={!phone}
            title={phone ?? t('journey.noPhoneOnFile')}
            className={`flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-2.5 text-xs font-semibold text-neutral-700 tap-target dark:border-neutral-700 dark:text-neutral-300 ${
              !phone ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <Phone className="h-4 w-4" /> {t('journey.phone')}
          </a>
        </div>
      </BottomSheet>
    </li>
  )
}

function Row({ label, value, warn = false, flagged = false }: { label: string; value: string; warn?: boolean; flagged?: boolean }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`font-semibold ${warn ? 'text-status-warn' : 'text-neutral-800 dark:text-neutral-200'}`}>
        {value}
        {flagged && (
          <>
            {' '}
            · {t('checkIn.flagged')}
          </>
        )}
      </span>
    </div>
  )
}

function GapEntry({ ms, distanceMeters, offClock = false }: { ms: number; distanceMeters: number | null; offClock?: boolean }) {
  const { t, language } = useLanguage()
  const isLong = ms / 60_000 > GAP_FLAG_THRESHOLD_MINUTES
  // A long gap is only flagged when it also looks like idle/rest rather
  // than real travel -- i.e. the distance is short, or unknown (missing
  // coordinates keep the old, conservative "flag it" default).
  const looksStationary = distanceMeters == null || distanceMeters <= GAP_FLAG_MAX_DISTANCE_METERS
  const flagged = !offClock && isLong && looksStationary
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
        {offClock ? t('journey.offTheClock') : t('journey.transitGapRest')}
      </p>
      <span className="flex shrink-0 items-center gap-1.5">
        {flagged && (
          <span className="rounded-full bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warn">
            {t('checkIn.flagged')}
          </span>
        )}
        <span className={`text-xs font-medium ${flagged ? 'text-status-warn' : 'text-neutral-400'}`}>
          {formatDuration(ms, language)}
          {!offClock && distanceMeters != null && ` · ${formatDistance(distanceMeters)}`}
        </span>
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
  const { t, tValue } = useLanguage()
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
            {tValue(`visitOption:${o.id}`, o.label)}
          </button>
        ))}
        {options.length === 0 && <p className="text-xs text-neutral-400">{t('journey.noOptionsConfigured')}</p>}
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
  const { t, tValue, language } = useLanguage()

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

  const label = visit.customer_id ? customerName ?? t('common.loading') : t('common.unassignedVisit')
  const closed = !!visit.checked_out_at
  const voided = !!visit.cancelled_at
  const duration = closed
    ? formatDuration(new Date(visit.checked_out_at!).getTime() - new Date(visit.checked_in_at).getTime(), language)
    : t('journey.inProgress')
  const timeRange = `${formatTime(visit.checked_in_at)} → ${closed ? formatTime(visit.checked_out_at) : t('journey.now')}`

  const visitStatus = visit.visit_status_id ? optionsById[visit.visit_status_id] : undefined
  const orderStatus = visit.order_status_id ? optionsById[visit.order_status_id] : undefined
  const paymentStatus = visit.payment_status_id ? optionsById[visit.payment_status_id] : undefined
  const hasRecord = visitStatus || orderStatus || paymentStatus || visit.next_appointment
  const summaryLine1 = [visitStatus, orderStatus, paymentStatus]
    .filter((o): o is VisitOption => !!o)
    .map((o) => tValue(`visitOption:${o.id}`, o.label))
    .join(' | ')
  const hasSummary = !!summaryLine1 || !!visit.next_appointment || !!visit.remarks

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
      setActionError(e instanceof Error ? e.message : t('journey.saveError'))
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
      setActionError(e instanceof Error ? e.message : t('journey.voidError'))
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
      setActionError(e instanceof Error ? e.message : t('journey.unvoidError'))
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
        className={`flex w-full flex-col rounded-xl2 border bg-white p-4 text-left shadow-card tap-target dark:bg-neutral-900 ${
          voided ? 'border-dashed border-neutral-300 opacity-60 dark:border-neutral-600' : 'border-neutral-200 dark:border-neutral-700'
        }`}
      >
        <div className="flex w-full items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
              <span className={voided ? 'line-through' : undefined}>{label}</span>
              {voided && (
                <span className="rounded-full bg-status-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-status-danger">
                  {t('journey.voided')}
                </span>
              )}
              {!voided && closed && !visit.auto_closed && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-status-working/10 px-1.5 py-0.5 text-[10px] font-medium text-status-working">
                  <Check className="h-2.5 w-2.5" /> {t('journey.done')}
                </span>
              )}
              {!voided && visit.auto_closed && (
                <span className="rounded-full bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warn">{t('journey.auto')}</span>
              )}
            </p>
            <p className="mt-1 font-mono text-xs text-neutral-400">{timeRange}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="text-right">
              <p className={`text-sm font-bold ${visit.out_of_range ? 'text-status-warn' : 'text-earth-500'}`}>{duration}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{t('journey.duration')}</p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </div>

        {!voided && hasSummary && (
          <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            {summaryLine1 && <p className="font-medium text-neutral-700 dark:text-neutral-300">{summaryLine1}</p>}
            {visit.next_appointment && <p>{t('journey.nextVisitLine', { date: formatDate(visit.next_appointment) })}</p>}
            {visit.remarks && <p className="whitespace-pre-wrap">{visit.remarks}</p>}
          </div>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="space-y-3 p-4">
          {journey.error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{journey.error}</p>}
          {actionError && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{actionError}</p>}

          {voided && (
            <div className="rounded-xl2 border border-status-danger/30 bg-status-danger/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-status-danger">
                <Ban className="h-4 w-4" /> {t('journey.voidedBannerTitle')}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {visit.cancel_reason} · {formatDate(visit.cancelled_at)} {t('journey.at')} {formatTime(visit.cancelled_at)}
              </p>
              {canUnvoid && (
                <button
                  onClick={handleUnvoid}
                  disabled={busy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white tap-target disabled:opacity-60 dark:bg-white dark:text-neutral-900"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {busy ? t('journey.restoring') : t('journey.restoreVisit')}
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
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{t('nav.checkIn')}</p>
                  <p className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">{formatTime(visit.checked_in_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-visiting/10 text-status-visiting">
                  <LogOut className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{t('journey.checkOutLabel')}</p>
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
                <Timer className="h-3.5 w-3.5 text-earth-500" /> {t('journey.visitDuration')}{' '}
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{duration}</span>
              </p>
              <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <MapPin className={`h-3.5 w-3.5 ${visit.out_of_range ? 'text-status-warn' : 'text-status-working'}`} /> {t('journey.distance')}{' '}
                <span className={`font-semibold ${visit.out_of_range ? 'text-status-warn' : 'text-neutral-800 dark:text-neutral-200'}`}>
                  {formatDistance(visit.distance_m)}
                  {visit.out_of_range && (
                    <>
                      {' '}
                      · {t('checkIn.flagged')}
                    </>
                  )}
                </span>
              </p>
            </div>
          </div>

          {!voided &&
            (showForm ? (
              <div className="space-y-4">
                <ChipGroup label={t('journey.typeOfVisit')} options={byKind.visit_type} value={visitTypeId} onChange={setVisitTypeId} />
                <ChipGroup
                  label={t('journey.visitStatusOptional')}
                  options={byKind.visit_status}
                  value={visitStatusId}
                  onChange={setVisitStatusId}
                />
                <ChipGroup
                  label={t('journey.orderStatusOptional')}
                  options={byKind.order_status}
                  value={orderStatusId}
                  onChange={setOrderStatusId}
                />
                <ChipGroup
                  label={t('journey.paymentStatusOptional')}
                  options={byKind.payment_status}
                  value={paymentStatusId}
                  onChange={setPaymentStatusId}
                />

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('journey.nextVisitOptional')}</p>
                  <div className="flex flex-wrap gap-2">
                    {NEXT_VISIT_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => pickNextVisit(preset.days)}
                        className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600 tap-target"
                      >
                        {t(preset.key)}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => pickCustomDate(e.target.value)}
                      className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600"
                    />
                  </div>
                  {nextAppointment && (
                    <p className="mt-2 text-xs text-neutral-500">
                      {t('journey.scheduledPrefix', { date: formatDate(nextAppointment) })}
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('journey.remarksOptional')}</p>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    placeholder={t('journey.remarksPlaceholder')}
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
                    {journey.busy ? t('journey.checkingOut') : t('journey.checkOutButton')}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEdit}
                      disabled={busy}
                      className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 tap-target disabled:opacity-60 dark:border-neutral-700"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSaveRecord}
                      disabled={busy}
                      className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {busy ? t('journey.saving') : t('journey.saveChanges')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {hasRecord ? (
                  <div className="space-y-2.5 rounded-xl2 border border-neutral-200 p-3 dark:border-neutral-700">
                    {visitStatus && (
                      <RecordRow
                        icon={visitStatusIcon(visitStatus.label)}
                        label={t('journey.visitStatusRecord')}
                        value={tValue(`visitOption:${visitStatus.id}`, visitStatus.label)}
                      />
                    )}
                    {orderStatus && (
                      <RecordRow
                        icon={orderStatusIcon(orderStatus.label)}
                        label={t('journey.orderStatusRecord')}
                        value={tValue(`visitOption:${orderStatus.id}`, orderStatus.label)}
                      />
                    )}
                    {paymentStatus && (
                      <RecordRow
                        icon={paymentStatusIcon(paymentStatus.label)}
                        label={t('journey.paymentStatusRecord')}
                        value={tValue(`visitOption:${paymentStatus.id}`, paymentStatus.label)}
                      />
                    )}
                    {visit.next_appointment && (
                      <RecordRow
                        icon={<Calendar className="h-4 w-4" />}
                        label={t('journey.nextVisitRecord')}
                        value={formatDate(visit.next_appointment)}
                      />
                    )}
                  </div>
                ) : (
                  canEditRecord && <p className="text-center text-xs text-neutral-400">{t('journey.noRecordYet')}</p>
                )}

                {canEditRecord && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 tap-target dark:border-neutral-700"
                  >
                    <Pencil className="h-4 w-4" /> {hasRecord ? t('journey.editRecord') : t('journey.addRecord')}
                  </button>
                )}
              </>
            ))}

          {canVoid && !showForm && (
            <button
              onClick={() => setConfirmVoidOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-status-danger/30 py-3 text-sm font-semibold text-status-danger tap-target"
            >
              <Ban className="h-4 w-4" /> {t('journey.voidVisit')}
            </button>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={confirmCheckOutOpen} onClose={() => setConfirmCheckOutOpen(false)} title={t('journey.confirmCheckOutTitle')}>
        <div className="p-4">
          <p className="text-sm text-neutral-600">{t('journey.confirmCheckOutBody', { label })}</p>
          <button
            onClick={handleCheckOut}
            disabled={journey.busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {journey.busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {journey.busy ? t('journey.checkingOut') : t('journey.yesCheckOut')}
          </button>
          <button
            onClick={() => setConfirmCheckOutOpen(false)}
            className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target"
          >
            {t('common.cancel')}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmVoidOpen} onClose={() => setConfirmVoidOpen(false)} title={t('journey.confirmVoidTitle')}>
        <div className="p-4">
          <p className="text-sm text-neutral-600">{t('journey.confirmVoidBody', { label })}</p>
          <button
            onClick={handleConfirmVoid}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-status-danger py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {busy ? t('journey.voiding') : t('journey.voidVisit')}
          </button>
          <button
            onClick={() => setConfirmVoidOpen(false)}
            className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target"
          >
            {t('common.cancel')}
          </button>
        </div>
      </BottomSheet>
    </li>
  )
}
