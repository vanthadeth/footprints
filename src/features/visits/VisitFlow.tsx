import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, Building2, ChevronLeft, Loader2, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useAppSettings } from '@/hooks/useAppSettings'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { formatDistance } from '@/lib/geo'
import { formatDate, formatDuration, formatTime } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'
import { useVisitOptions } from './useVisitOptions'
import type { VisitOption, VisitOptionKind } from './visitOptionsService'
import { visitsService, type NearbyCustomer, type VisitOutcomeDetails } from './visitsService'

type Step = 'picker' | 'confirm' | 'record'

/** A customer already chosen before the flow opened (Home's Next Customer card, a Customer detail page's VISIT button) -- skips the nearby-picker step and goes straight to a one-tap confirm. */
export interface PresetCustomer {
  id: string
  shopName: string
}

const NEXT_VISIT_PRESETS: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

/**
 * The full-screen, "locked" Check In flow (spec): nearest-customer picker ->
 * visit record capture -> check-out confirmation. It sits above the title
 * bar and tab bar (z-30) but under the offline banner (z-40) so connectivity
 * warnings still surface while the app is locked into a visit.
 *
 * The `record` step only ever leaves through a deliberate action -- confirm
 * check-out (itself behind an "are you sure" step, spec), cancel check-in
 * (for a wrong/accidental one -- app.cancel_visit, no checkout record at
 * all), or the server auto-checking the visit out from underneath it --
 * that's what "lock the app" means here. The `picker` step, before any
 * visit exists, can still be dismissed with no side effect. All visit
 * record fields are optional; nothing here blocks checking out.
 */
export function VisitFlow({
  open,
  onClose,
  presetCustomer,
}: {
  open: boolean
  onClose: () => void
  /** Skip the nearby-picker step and go straight to a one-tap confirm for this customer. */
  presetCustomer?: PresetCustomer | null
}) {
  const journey = useJourneyContext()
  const { byKind } = useVisitOptions()
  const settings = useAppSettings()

  const [step, setStep] = useState<Step>(journey.openVisit ? 'record' : presetCustomer ? 'confirm' : 'picker')
  const [locState, setLocState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [customers, setCustomers] = useState<NearbyCustomer[]>([])
  const [locError, setLocError] = useState<string | null>(null)
  const [farCustomer, setFarCustomer] = useState<NearbyCustomer | null>(null)

  const [visitTypeId, setVisitTypeId] = useState<string | null>(null)
  const [visitStatusId, setVisitStatusId] = useState<string | null>(null)
  const [orderStatusId, setOrderStatusId] = useState<string | null>(null)
  const [paymentStatusId, setPaymentStatusId] = useState<string | null>(null)
  const [nextAppointment, setNextAppointment] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const reselectingRef = useRef(false)
  const customerNames = useCustomerNames([journey.openVisit?.customer_id ?? null])

  async function refreshLocation() {
    setLocState('loading')
    setLocError(null)
    try {
      const reading = await locationService.getCurrentPosition()
      setAccuracy(reading.accuracy)
      // A preset customer already has its own confirm UI (single customer,
      // no list) -- no need for the nearby-customers round trip at all.
      if (!presetCustomer) {
        const nearby = await visitsService.nearbyCustomers(reading.latitude, reading.longitude, 5)
        setCustomers(nearby)
      }
      setLocState('ready')
    } catch (e) {
      setLocError(
        e instanceof LocationError && e.status === 'permission_denied'
          ? 'Location access is required to check in.'
          : 'Could not get your location. Try again.'
      )
      setLocState('error')
    }
  }

  // Reset to a clean slate every time the flow opens -- picking up mid-visit
  // (e.g. the app was closed and reopened while a visit was still active)
  // goes straight to the record step instead of the picker.
  useEffect(() => {
    if (!open) return
    setStep(journey.openVisit ? 'record' : presetCustomer ? 'confirm' : 'picker')
    setVisitTypeId(null)
    setVisitStatusId(null)
    setOrderStatusId(null)
    setPaymentStatusId(null)
    setNextAppointment(null)
    setCustomDate('')
    setRemarks('')
    setConfirmOpen(false)
    setFarCustomer(null)
    if (!journey.openVisit) void refreshLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the flow is (re)opened, not on every journey/state change
  }, [open, presetCustomer?.id])

  // A visit just started while we were on the picker/confirm step -- move on to recording it.
  useEffect(() => {
    if (step !== 'record' && journey.openVisit) setStep('record')
  }, [step, journey.openVisit])

  // The visit closed (our own confirm, or the server auto-checking it out
  // from underneath us) while we're on the record step and NOT in the
  // middle of a deliberate reselect -- there's nothing left to lock, so exit.
  useEffect(() => {
    if (open && step === 'record' && !journey.openVisit && !reselectingRef.current) onClose()
  }, [open, step, journey.openVisit, onClose])

  // A reselect's cancelVisit() call just settled (succeeded or failed) --
  // on success, go back to the picker for a fresh location + customer
  // list; on failure the visit is still open, so stay put (the error
  // banner shows why).
  useEffect(() => {
    if (journey.busy) return
    if (reselectingRef.current) {
      reselectingRef.current = false
      if (!journey.openVisit) {
        setStep('picker')
        void refreshLocation()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when a reselect settles, not on every refreshLocation identity change
  }, [journey.busy, journey.openVisit])

  if (!open) return null

  const customerId = journey.openVisit?.customer_id ?? null
  const customerName = customerId ? customerNames[customerId] : null

  function handleReselect() {
    reselectingRef.current = true
    void journey.cancelVisit()
  }

  // A customer farther than the visit geofence radius is still selectable
  // (the picker is a convenience, not a hard boundary) but is very likely a
  // mis-tap or a stale location fix -- confirm before starting the visit
  // instead of silently checking in somewhere the auto check-out will
  // immediately flag anyway.
  function handleSelectCustomer(customer: NearbyCustomer) {
    if (customer.distance_m > settings.checkinRadiusM) {
      setFarCustomer(customer)
    } else {
      void journey.startVisit(customer.id)
    }
  }

  function handleConfirmFarCheckIn() {
    const customer = farCustomer
    setFarCustomer(null)
    if (customer) void journey.startVisit(customer.id)
  }

  function handleCancelCheckIn() {
    void journey.cancelVisit()
  }

  function handleConfirm() {
    setConfirmOpen(false)
    haptic('light')
    const details: VisitOutcomeDetails = {
      visitTypeId,
      visitStatusId,
      orderStatusId,
      paymentStatusId,
      nextAppointment,
      remarks: remarks.trim() || null,
    }
    void journey.endVisit(details)
  }

  function pickNextVisit(days: number) {
    const iso = new Date(Date.now() + days * 86_400_000).toISOString()
    setNextAppointment(iso)
    setCustomDate('')
  }

  function pickCustomDate(value: string) {
    setCustomDate(value)
    setNextAppointment(value ? new Date(`${value}T00:00:00`).toISOString() : null)
  }

  // Portaled to <body> for the same reason BottomSheet is: rendered inline
  // inside AppLayout's per-page `animate-fade-in-up` wrapper, this "fixed"
  // overlay would be clipped to that wrapper's own content box rather than
  // the full viewport, since its `transform` (present even at rest -- the
  // animation's fill-mode is `both`) makes it the containing block for any
  // `position: fixed` descendant.
  return createPortal(
    <div className="fixed inset-0 z-30 flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <header
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 pb-3 dark:border-neutral-800"
      >
        <h1 className="text-base font-semibold text-neutral-900">
          {step === 'picker' ? 'Select a Customer' : step === 'confirm' ? 'Check In' : 'Visit Record'}
        </h1>
        {step === 'record' ? (
          <span className="flex items-center gap-1 text-xs font-medium text-status-working">
            <ShieldCheck className="h-3.5 w-3.5" /> Locked
          </span>
        ) : (
          <button onClick={onClose} aria-label="Cancel" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 tap-target">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {journey.error && (
          <div role="alert" className="mx-4 mt-4 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {journey.error}
          </div>
        )}

        {step === 'picker' ? (
          <PickerStep
            locState={locState}
            accuracy={accuracy}
            customers={customers}
            locError={locError}
            busy={journey.busy}
            farThresholdM={settings.checkinRadiusM}
            maxAccuracyM={settings.maxLocationAccuracyM}
            onRefresh={refreshLocation}
            onSelect={handleSelectCustomer}
            onSkip={() => journey.startVisit(null)}
          />
        ) : step === 'confirm' && presetCustomer ? (
          <ConfirmStep
            customerName={presetCustomer.shopName}
            locState={locState}
            accuracy={accuracy}
            locError={locError}
            busy={journey.busy}
            maxAccuracyM={settings.maxLocationAccuracyM}
            onRefresh={refreshLocation}
            onCheckIn={() => journey.startVisit(presetCustomer.id)}
          />
        ) : (
          <RecordStep
            customerName={customerName}
            checkedInAt={journey.openVisit?.checked_in_at ?? null}
            byKind={byKind}
            visitTypeId={visitTypeId}
            visitStatusId={visitStatusId}
            orderStatusId={orderStatusId}
            paymentStatusId={paymentStatusId}
            nextAppointment={nextAppointment}
            customDate={customDate}
            remarks={remarks}
            busy={journey.busy}
            onVisitType={setVisitTypeId}
            onVisitStatus={setVisitStatusId}
            onOrderStatus={setOrderStatusId}
            onPaymentStatus={setPaymentStatusId}
            onNextVisitPreset={pickNextVisit}
            onCustomDate={pickCustomDate}
            onRemarks={setRemarks}
            onReselect={handleReselect}
            onCancelCheckIn={handleCancelCheckIn}
            onRequestConfirm={() => setConfirmOpen(true)}
          />
        )}
      </div>

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Check Out">
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            You're about to check out{customerName ? ` of ${customerName}` : ''}. This can't be undone -- make sure you're ready.
          </p>
          <button
            onClick={handleConfirm}
            disabled={journey.busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
          >
            {journey.busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {journey.busy ? 'Checking out…' : 'Yes, Check Out'}
          </button>
          <button
            onClick={() => setConfirmOpen(false)}
            className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={farCustomer !== null} onClose={() => setFarCustomer(null)} title="Customer Is Far Away">
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            {farCustomer?.shop_name} is {farCustomer ? formatDistance(farCustomer.distance_m) : ''} from your current
            location -- farther than the {formatDistance(settings.checkinRadiusM)} visit range. Check in here anyway?
          </p>
          <button
            onClick={handleConfirmFarCheckIn}
            disabled={journey.busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-status-warn py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
          >
            {journey.busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {journey.busy ? 'Checking in…' : 'Check In Anyway'}
          </button>
          <button
            onClick={() => setFarCustomer(null)}
            className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    </div>,
    document.body
  )
}

function PickerStep({
  locState,
  accuracy,
  customers,
  locError,
  busy,
  farThresholdM,
  maxAccuracyM,
  onRefresh,
  onSelect,
  onSkip,
}: {
  locState: 'loading' | 'ready' | 'error'
  accuracy: number | null
  customers: NearbyCustomer[]
  locError: string | null
  busy: boolean
  farThresholdM: number
  maxAccuracyM: number
  onRefresh: () => void
  onSelect: (customer: NearbyCustomer) => void
  onSkip: () => void
}) {
  const accuracyTooLow = locState === 'ready' && accuracy != null && accuracy > maxAccuracyM
  const blocked = busy || accuracyTooLow

  return (
    <div className="p-4">
      <div className="rounded-xl2 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className={`flex items-center gap-1.5 text-xs ${accuracyTooLow ? 'text-status-warn' : 'text-neutral-500'}`}>
            <MapPin className="h-3.5 w-3.5" />
            {locState === 'loading' && 'Finding your location…'}
            {locState === 'ready' && accuracy != null && `Current location · accuracy ${Math.round(accuracy)} m`}
            {locState === 'error' && (locError ?? 'Location unavailable')}
          </p>
          <button
            onClick={onRefresh}
            disabled={locState === 'loading'}
            aria-label="Refresh location"
            className="flex h-9 w-9 items-center justify-center rounded-full text-brand-600 tap-target disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${locState === 'loading' ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {accuracyTooLow && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-status-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Accuracy is too low to check in -- move to an open area and refresh.
          </p>
        )}
      </div>

      {locState === 'loading' && (
        <div className="mt-3 space-y-2">
          <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      )}

      {locState === 'ready' && (
        <div className="mt-3 space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Nearest Customers</p>
          {customers.length === 0 && <p className="rounded-xl2 bg-white p-4 text-sm text-neutral-500 shadow-card">No customers found nearby.</p>}
          {customers.map((c) => {
            const isFar = c.distance_m > farThresholdM
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                disabled={blocked}
                className="flex w-full items-center gap-3 rounded-xl2 bg-white px-4 py-3.5 text-left shadow-card tap-target disabled:opacity-60"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{c.shop_name}</p>
                  <p className="truncate text-xs text-neutral-500">{c.business_type}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className={`text-sm font-medium ${isFar ? 'text-status-warn' : 'text-neutral-500'}`}>
                    {formatDistance(c.distance_m)}
                  </span>
                  {isFar && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-status-warn">
                      <AlertTriangle className="h-3 w-3" /> Far away
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <button
        onClick={onSkip}
        disabled={blocked}
        className="mt-4 w-full rounded-xl border border-dashed border-neutral-300 py-3.5 text-sm font-semibold text-neutral-600 tap-target disabled:opacity-60"
      >
        Can't find them? Check in without a customer
      </button>
    </div>
  )
}

function ConfirmStep({
  customerName,
  locState,
  accuracy,
  locError,
  busy,
  maxAccuracyM,
  onRefresh,
  onCheckIn,
}: {
  customerName: string
  locState: 'loading' | 'ready' | 'error'
  accuracy: number | null
  locError: string | null
  busy: boolean
  maxAccuracyM: number
  onRefresh: () => void
  onCheckIn: () => void
}) {
  const accuracyTooLow = locState === 'ready' && accuracy != null && accuracy > maxAccuracyM
  const blocked = busy || locState !== 'ready' || accuracyTooLow

  return (
    <div className="p-4">
      <div className="rounded-xl2 bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <Building2 className="h-5 w-5" />
          </div>
          <p className="truncate text-base font-semibold text-neutral-900">{customerName}</p>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <p className={`flex items-center gap-1.5 text-xs ${accuracyTooLow ? 'text-status-warn' : 'text-neutral-500'}`}>
            <MapPin className="h-3.5 w-3.5" />
            {locState === 'loading' && 'Finding your location…'}
            {locState === 'ready' && accuracy != null && `Current location · accuracy ${Math.round(accuracy)} m`}
            {locState === 'error' && (locError ?? 'Location unavailable')}
          </p>
          <button
            onClick={onRefresh}
            disabled={locState === 'loading'}
            aria-label="Refresh location"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-600 tap-target disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${locState === 'loading' ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {accuracyTooLow && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-status-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Accuracy is too low to check in -- move to an open area and refresh.
          </p>
        )}
      </div>

      <button
        onClick={onCheckIn}
        disabled={blocked}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white tap-target disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Checking in…' : 'CHECK IN'}
      </button>
    </div>
  )
}

function RecordStep({
  customerName,
  checkedInAt,
  byKind,
  visitTypeId,
  visitStatusId,
  orderStatusId,
  paymentStatusId,
  nextAppointment,
  customDate,
  remarks,
  busy,
  onVisitType,
  onVisitStatus,
  onOrderStatus,
  onPaymentStatus,
  onNextVisitPreset,
  onCustomDate,
  onRemarks,
  onReselect,
  onCancelCheckIn,
  onRequestConfirm,
}: {
  customerName: string | null | undefined
  checkedInAt: string | null
  byKind: Record<VisitOptionKind, VisitOption[]>
  visitTypeId: string | null
  visitStatusId: string | null
  orderStatusId: string | null
  paymentStatusId: string | null
  nextAppointment: string | null
  customDate: string
  remarks: string
  busy: boolean
  onVisitType: (id: string) => void
  onVisitStatus: (id: string) => void
  onOrderStatus: (id: string) => void
  onPaymentStatus: (id: string) => void
  onNextVisitPreset: (days: number) => void
  onCustomDate: (value: string) => void
  onRemarks: (value: string) => void
  onReselect: () => void
  onCancelCheckIn: () => void
  onRequestConfirm: () => void
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl2 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <Building2 className="h-4 w-4 shrink-0 text-brand-500" />
              <span className="truncate">{customerName ?? 'No customer selected'}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Checked in {checkedInAt ? formatTime(checkedInAt) : '—'}
              {checkedInAt && ` · ${formatDuration(Date.now() - new Date(checkedInAt).getTime())} so far`}
            </p>
          </div>
          <button
            onClick={onReselect}
            disabled={busy}
            className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 tap-target disabled:opacity-60"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Reselect
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-neutral-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Auto check-out is on -- you'll be checked out automatically if you move away from here.
        </p>
      </div>

      <ChipGroup label="Type of Visit (optional)" options={byKind.visit_type} value={visitTypeId} onChange={onVisitType} />
      <ChipGroup label="Visit Status (optional)" options={byKind.visit_status} value={visitStatusId} onChange={onVisitStatus} />
      <ChipGroup label="Order Status (optional)" options={byKind.order_status} value={orderStatusId} onChange={onOrderStatus} />
      <ChipGroup label="Payment Status (optional)" options={byKind.payment_status} value={paymentStatusId} onChange={onPaymentStatus} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Next Visit (optional)</p>
        <div className="flex flex-wrap gap-2">
          {NEXT_VISIT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onNextVisitPreset(preset.days)}
              className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600 tap-target"
            >
              {preset.label}
            </button>
          ))}
          <input
            type="date"
            value={customDate}
            onChange={(e) => onCustomDate(e.target.value)}
            className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600"
          />
        </div>
        {nextAppointment && <p className="mt-2 text-xs text-neutral-500">Scheduled: {formatDate(nextAppointment)}</p>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Remarks (optional)</p>
        <textarea
          value={remarks}
          onChange={(e) => onRemarks(e.target.value)}
          rows={3}
          placeholder="Anything worth noting about this visit…"
          className="w-full rounded-xl2 border border-neutral-200 bg-white p-3 text-sm text-neutral-900 placeholder:text-neutral-400"
        />
      </div>

      <button
        onClick={onRequestConfirm}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Checking out…' : 'CHECK OUT (CONFIRM)'}
      </button>

      <button
        onClick={onCancelCheckIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-status-danger/30 py-3.5 text-sm font-semibold text-status-danger tap-target disabled:opacity-40"
      >
        <Ban className="h-4 w-4" /> Cancel Check In
      </button>
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
