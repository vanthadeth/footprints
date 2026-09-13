import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronLeft, Loader2, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { formatDistance } from '@/lib/geo'
import { formatDuration, formatTime } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'
import { useVisitOptions } from './useVisitOptions'
import type { VisitOption, VisitOptionKind } from './visitOptionsService'
import { visitsService, type NearbyCustomer, type VisitOutcomeDetails } from './visitsService'

type Step = 'picker' | 'record'

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
 * There's deliberately no way out of the `record` step other than
 * confirming check-out (or the server auto-checking the visit out from
 * underneath it) -- that's what "lock the app" means here. The `picker`
 * step, before any visit exists, can still be dismissed with no side effect.
 */
export function VisitFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const journey = useJourneyContext()
  const { byKind } = useVisitOptions()

  const [step, setStep] = useState<Step>(journey.openVisit ? 'record' : 'picker')
  const [locState, setLocState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [customers, setCustomers] = useState<NearbyCustomer[]>([])
  const [locError, setLocError] = useState<string | null>(null)

  const [visitTypeId, setVisitTypeId] = useState<string | null>(null)
  const [visitStatusId, setVisitStatusId] = useState<string | null>(null)
  const [orderStatusId, setOrderStatusId] = useState<string | null>(null)
  const [paymentStatusId, setPaymentStatusId] = useState<string | null>(null)
  const [nextAppointment, setNextAppointment] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState('')
  const [remarks, setRemarks] = useState('')

  const reselectingRef = useRef(false)
  const customerNames = useCustomerNames([journey.openVisit?.customer_id ?? null])

  async function refreshLocation() {
    setLocState('loading')
    setLocError(null)
    try {
      const reading = await locationService.getCurrentPosition()
      setAccuracy(reading.accuracy)
      const nearby = await visitsService.nearbyCustomers(reading.latitude, reading.longitude, 5)
      setCustomers(nearby)
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
    setStep(journey.openVisit ? 'record' : 'picker')
    setVisitTypeId(null)
    setVisitStatusId(null)
    setOrderStatusId(null)
    setPaymentStatusId(null)
    setNextAppointment(null)
    setCustomDate('')
    setRemarks('')
    if (!journey.openVisit) void refreshLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the flow is (re)opened, not on every journey/state change
  }, [open])

  // A visit just started while we were on the picker -- move on to recording it.
  useEffect(() => {
    if (step === 'picker' && journey.openVisit) setStep('record')
  }, [step, journey.openVisit])

  // The visit closed (our own confirm, or the server auto-checking it out
  // from underneath us) while we're on the record step and NOT in the
  // middle of a deliberate reselect -- there's nothing left to lock, so exit.
  useEffect(() => {
    if (open && step === 'record' && !journey.openVisit && !reselectingRef.current) onClose()
  }, [open, step, journey.openVisit, onClose])

  // A reselect's endVisit() call just settled (succeeded or failed) -- on
  // success, go back to the picker for a fresh location + customer list;
  // on failure the visit is still open, so stay put (the error banner shows why).
  useEffect(() => {
    if (journey.busy) return
    if (reselectingRef.current) {
      reselectingRef.current = false
      if (!journey.openVisit) {
        setStep('picker')
        void refreshLocation()
      }
    }
  }, [journey.busy, journey.openVisit])

  if (!open) return null

  const customerId = journey.openVisit?.customer_id ?? null
  const customerName = customerId ? customerNames[customerId] : null
  const detailsComplete = Boolean(visitTypeId && visitStatusId && orderStatusId && paymentStatusId)

  function handleReselect() {
    reselectingRef.current = true
    void journey.endVisit()
  }

  function handleConfirm() {
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

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <header
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 pb-3 dark:border-neutral-800"
      >
        <h1 className="text-base font-semibold text-neutral-900">{step === 'picker' ? 'Select a Customer' : 'Visit Record'}</h1>
        {step === 'picker' ? (
          <button onClick={onClose} aria-label="Cancel" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 tap-target">
            <X className="h-5 w-5" />
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-status-working">
            <ShieldCheck className="h-3.5 w-3.5" /> Locked
          </span>
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
            onRefresh={refreshLocation}
            onSelect={(id) => journey.startVisit(id)}
            onSkip={() => journey.startVisit(null)}
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
            detailsComplete={detailsComplete}
            onVisitType={setVisitTypeId}
            onVisitStatus={setVisitStatusId}
            onOrderStatus={setOrderStatusId}
            onPaymentStatus={setPaymentStatusId}
            onNextVisitPreset={pickNextVisit}
            onCustomDate={pickCustomDate}
            onRemarks={setRemarks}
            onReselect={handleReselect}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  )
}

function PickerStep({
  locState,
  accuracy,
  customers,
  locError,
  busy,
  onRefresh,
  onSelect,
  onSkip,
}: {
  locState: 'loading' | 'ready' | 'error'
  accuracy: number | null
  customers: NearbyCustomer[]
  locError: string | null
  busy: boolean
  onRefresh: () => void
  onSelect: (id: string) => void
  onSkip: () => void
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between rounded-xl2 bg-white p-4 shadow-card">
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
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
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-xl2 bg-white px-4 py-3.5 text-left shadow-card tap-target disabled:opacity-60"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">{c.shop_name}</p>
                <p className="truncate text-xs text-neutral-500">{c.business_type}</p>
              </div>
              <span className="shrink-0 text-sm font-medium text-neutral-500">{formatDistance(c.distance_m)}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onSkip}
        disabled={busy}
        className="mt-4 w-full rounded-xl border border-dashed border-neutral-300 py-3.5 text-sm font-semibold text-neutral-600 tap-target disabled:opacity-60"
      >
        Can't find them? Check in without a customer
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
  detailsComplete,
  onVisitType,
  onVisitStatus,
  onOrderStatus,
  onPaymentStatus,
  onNextVisitPreset,
  onCustomDate,
  onRemarks,
  onReselect,
  onConfirm,
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
  detailsComplete: boolean
  onVisitType: (id: string) => void
  onVisitStatus: (id: string) => void
  onOrderStatus: (id: string) => void
  onPaymentStatus: (id: string) => void
  onNextVisitPreset: (days: number) => void
  onCustomDate: (value: string) => void
  onRemarks: (value: string) => void
  onReselect: () => void
  onConfirm: () => void
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

      <ChipGroup label="Type of Visit" options={byKind.visit_type} value={visitTypeId} onChange={onVisitType} />
      <ChipGroup label="Visit Status" options={byKind.visit_status} value={visitStatusId} onChange={onVisitStatus} />
      <ChipGroup label="Order Status" options={byKind.order_status} value={orderStatusId} onChange={onOrderStatus} />
      <ChipGroup label="Payment Status" options={byKind.payment_status} value={paymentStatusId} onChange={onPaymentStatus} />

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
        {nextAppointment && <p className="mt-2 text-xs text-neutral-500">Scheduled: {new Date(nextAppointment).toLocaleDateString()}</p>}
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
        onClick={onConfirm}
        disabled={busy || !detailsComplete}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Checking out…' : 'CHECK OUT (CONFIRM)'}
      </button>
      {!detailsComplete && <p className="text-center text-xs text-neutral-400">Fill in Type, Status, Order and Payment to check out.</p>}
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
