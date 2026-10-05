import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, Check, ChevronLeft, ChevronRight, Info, Loader2, Lock, RefreshCw, Search, Store } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SlideToConfirm } from '@/components/SlideToConfirm'
import { useLanguage } from '@/i18n/LanguageContext'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useAppSettings } from '@/hooks/useAppSettings'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { formatDistance } from '@/lib/geo'
import { formatDate, formatDuration, formatTime } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'
import { usePlan } from '@/features/plan/usePlan'
import { todayDateString } from '@/lib/dateRange'
import { useVisitOptions } from './useVisitOptions'
import type { VisitOption, VisitOptionKind } from './visitOptionsService'
import { visitsService, type NearbyCustomer, type VisitOutcomeDetails } from './visitsService'
import { AmountFields } from './AmountFields'
import { VisitPhotoStrip } from './VisitPhotoStrip'
import { outcomeFields, parseAmount } from './visitOutcome'
import { CustomerInsightsSheet } from './CustomerInsightsSheet'
import { insightsTeaser, useCustomerInsights } from './customerInsights'

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
  { label: 'In 2 weeks', days: 14 },
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
  // Today's planned stops get a "Planned" tag in the picker.
  const { items: planItems } = usePlan(todayDateString())
  const plannedIds = new Set(planItems.filter((i) => i.status === 'planned').map((i) => i.customer_id))
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
  const [orderAmount, setOrderAmount] = useState('')
  const [collected, setCollected] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const reselectingRef = useRef(false)
  const customerNames = useCustomerNames([journey.openVisit?.customer_id ?? null])
  const insightsId = journey.openVisit ? journey.openVisit.customer_id : (presetCustomer?.id ?? selectedId)
  const insights = useCustomerInsights(open ? insightsId : null)

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
        setSelectedId((cur) => cur ?? nearby[0]?.id ?? null)
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
    setOrderAmount('')
    setCollected('')
    setSelectedId(null)
    setInsightsOpen(false)
    setQuery('')
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
  const orderLabel = byKind.order_status.find((o) => o.id === orderStatusId)?.label
  const paymentLabel = byKind.payment_status.find((o) => o.id === paymentStatusId)?.label

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
    haptic('light')
    const fields = outcomeFields(orderLabel, paymentLabel)
    const details: VisitOutcomeDetails = {
      visitTypeId,
      visitStatusId,
      orderStatusId,
      paymentStatusId,
      nextAppointment,
      remarks: remarks.trim() || null,
      orderAmountUsd: fields.showOrderAmount ? parseAmount(orderAmount) : null,
      collectedUsd: fields.showCollected ? parseAmount(collected) : null,
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
  const selected = customers.find((c) => c.id === selectedId) ?? null
  const accuracyTooLow = locState === 'ready' && accuracy != null && accuracy > settings.maxLocationAccuracyM
  const pickBlocked = journey.busy || accuracyTooLow || locState !== 'ready'
  const pickTarget = step === 'confirm' && presetCustomer ? { id: presetCustomer.id, name: presetCustomer.shopName, far: false, distance: null as number | null } : selected ? { id: selected.id, name: selected.shop_name, far: selected.distance_m > settings.checkinRadiusM, distance: selected.distance_m } : null
  const filtered = query.trim() ? customers.filter((c) => c.shop_name.toLowerCase().includes(query.trim().toLowerCase())) : customers

  // Portaled to <body> for the same reason BottomSheet is: rendered inline
  // inside AppLayout's per-page `animate-fade-in-up` wrapper, this "fixed"
  // overlay would be clipped to that wrapper's own content box rather than
  // the full viewport, since its `transform` (present even at rest -- the
  // animation's fill-mode is `both`) makes it the containing block for any
  // `position: fixed` descendant.
  return createPortal(
    <div className="fixed inset-0 z-30 flex flex-col bg-neutral-50">
      <header style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }} className="grid grid-cols-[44px_1fr_44px] items-center px-3 pb-1.5">
        {step === 'record' ? (
          <span />
        ) : (
          <button onClick={onClose} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-900 tap-target">
            <ChevronLeft className="h-[22px] w-[22px]" />
          </button>
        )}
        <div className="text-center">
          <h1 className="text-[17px] font-bold text-neutral-900">{step === 'record' ? 'Visit record' : 'Check in'}</h1>
          {step === 'record' && <p className="text-xs text-neutral-500">Fill in, then slide to check out</p>}
        </div>
        {step === 'record' && journey.openVisit ? (
          <span className="flex items-center justify-end gap-1 text-xs font-bold text-status-working">
            <span className="h-2 w-2 rounded-full bg-status-working" />
            {formatTime(journey.openVisit.checked_in_at)}
          </span>
        ) : (
          <span />
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-[calc(9rem+env(safe-area-inset-bottom))]">
        {journey.error && (
          <div role="alert" className="mx-4 mt-2 rounded-xl bg-status-danger/10 px-3 py-2.5 text-sm font-semibold text-status-danger">
            {journey.error}
          </div>
        )}

        {step === 'record' ? (
          <RecordStep
            customerName={customerName}
            customerSub={[insights.customer?.business_type, insights.customer?.district_name ?? insights.customer?.province_name].filter(Boolean).join(' · ')}
            insightsTeaser={customerId ? insightsTeaser(insights) : null}
            onOpenInsights={() => setInsightsOpen(true)}
            visitId={journey.openVisit?.id ?? null}
            checkedInAt={journey.openVisit?.checked_in_at ?? null}
            byKind={byKind}
            visitTypeId={visitTypeId}
            visitStatusId={visitStatusId}
            orderStatusId={orderStatusId}
            paymentStatusId={paymentStatusId}
            nextAppointment={nextAppointment}
            customDate={customDate}
            remarks={remarks}
            orderLabel={orderLabel}
            paymentLabel={paymentLabel}
            orderAmount={orderAmount}
            collected={collected}
            busy={journey.busy}
            onOrderAmount={setOrderAmount}
            onCollected={setCollected}
            onVisitType={setVisitTypeId}
            onVisitStatus={setVisitStatusId}
            onOrderStatus={setOrderStatusId}
            onPaymentStatus={setPaymentStatusId}
            onNextVisitPreset={pickNextVisit}
            onClearNext={() => {
              setNextAppointment(null)
              setCustomDate('')
            }}
            onCustomDate={pickCustomDate}
            onRemarks={setRemarks}
            onReselect={handleReselect}
            onCancelCheckIn={handleCancelCheckIn}
          />
        ) : (
          <div className="flex flex-col gap-3 px-4 pt-1">
            <section aria-label="Your location" className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white py-2.5 pl-3.5 pr-2.5 shadow-card">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50">
                <span className="h-3 w-3 rounded-full bg-brand-500 ring-4 ring-white dark:ring-neutral-900" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${accuracyTooLow || locState === 'error' ? 'text-status-warn' : 'text-neutral-900'}`}>
                  {locState === 'loading' && 'Finding your location…'}
                  {locState === 'ready' && (accuracyTooLow ? 'GPS is too weak to check in' : 'Current location')}
                  {locState === 'error' && (locError ?? 'Location unavailable')}
                </span>
                {locState === 'ready' && accuracy != null && (
                  <span className="mt-px block text-xs text-neutral-500">
                    {accuracyTooLow ? 'Move to an open area and refresh · ' : ''}accuracy ±{Math.round(accuracy)} m
                  </span>
                )}
              </span>
              <button
                onClick={refreshLocation}
                disabled={locState === 'loading'}
                aria-label="Refresh location"
                className="flex h-10 w-10 items-center justify-center rounded-full text-brand-500 tap-target disabled:opacity-40"
              >
                <RefreshCw className={`h-[19px] w-[19px] ${locState === 'loading' ? 'animate-spin' : ''}`} />
              </button>
            </section>

            {step === 'confirm' && presetCustomer ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-500 bg-white px-3.5 py-3 shadow-card">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                  <Store className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-neutral-900">{presetCustomer.shopName}</span>
              </div>
            ) : (
              <>
                {customers.length > 3 && (
                  <label className="flex h-11 items-center gap-2.5 rounded-[14px] border border-neutral-100 bg-white px-3.5">
                    <Search className="h-[18px] w-[18px] shrink-0 text-neutral-500" aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search nearby customers"
                      aria-label="Search nearby customers"
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
                    />
                  </label>
                )}
                <section aria-label="Nearest customers">
                  <p className="px-0.5 pb-2 pt-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Nearest customers</p>
                  {locState === 'loading' && (
                    <div className="space-y-2">
                      <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
                      <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
                      <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
                    </div>
                  )}
                  {locState === 'ready' && filtered.length === 0 && (
                    <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm text-neutral-500 shadow-card">No customers found nearby.</p>
                  )}
                  <div role="radiogroup" aria-label="Customer" className="flex flex-col gap-2">
                    {filtered.map((c) => {
                      const on = c.id === selectedId
                      const far = c.distance_m > settings.checkinRadiusM
                      return (
                        <div key={c.id} className="flex flex-col gap-2">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setSelectedId(c.id)}
                            className={`flex items-center gap-3 rounded-2xl border-2 bg-white px-3.5 py-3 text-left shadow-card tap-target ${on ? 'border-brand-500' : 'border-transparent'}`}
                          >
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-500'}`}>
                              <Store className="h-5 w-5" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold text-neutral-900">{c.shop_name}</span>
                              <span className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
                                {plannedIds.has(c.id) && <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10.5px] font-bold text-brand-700">Planned</span>}
                                <span className="truncate">{[c.business_type, c.street_address].filter(Boolean).join(' · ')}</span>
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={`block text-sm font-bold ${far ? 'text-status-warn' : 'text-neutral-600'}`}>{formatDistance(c.distance_m)}</span>
                              {far && (
                                <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-status-warn">
                                  <AlertTriangle className="h-[11px] w-[11px]" aria-hidden /> Far away
                                </span>
                              )}
                            </span>
                            <span
                              aria-hidden
                              className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${on ? 'border-brand-500 bg-brand-500 shadow-[inset_0_0_0_4px_#fff] dark:shadow-[inset_0_0_0_4px_#232323]' : 'border-neutral-300'}`}
                            />
                          </button>
                          {on && (
                            <button
                              type="button"
                              onClick={() => setInsightsOpen(true)}
                              aria-haspopup="dialog"
                              className="-mt-1 flex items-center gap-2.5 rounded-[14px] bg-brand-50 px-3.5 py-2.5 text-left text-brand-700"
                            >
                              <Info className="h-[18px] w-[18px] shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold">Know before you go in</span>
                                <span className="block truncate text-xs opacity-85">{insights.loading ? 'Loading…' : insightsTeaser(insights)}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[13px] font-bold text-brand-500">
                                Insights
                                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                              </span>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
                <button
                  type="button"
                  onClick={() => journey.startVisit(null)}
                  disabled={pickBlocked}
                  className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-neutral-300 text-sm font-bold text-neutral-600 tap-target disabled:opacity-50"
                >
                  <Ban className="h-[17px] w-[17px] text-neutral-500" aria-hidden /> Visit without a customer
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-neutral-50/95 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          {step === 'record' ? (
            <>
              <SlideToConfirm label={journey.busy ? 'Checking out…' : 'Slide to check out'} variant="danger" busy={journey.busy} onConfirm={handleConfirm} />
              <p className="mt-2 text-center text-xs text-neutral-500">All fields are optional. Checking out can’t be undone.</p>
            </>
          ) : (
            <>
              <SlideToConfirm
                label={journey.busy ? 'Checking in…' : 'Slide to check in'}
                busy={journey.busy}
                disabled={pickBlocked || !pickTarget}
                onConfirm={() => {
                  if (!pickTarget) return
                  if (selected && step === 'picker') handleSelectCustomer(selected)
                  else void journey.startVisit(pickTarget.id)
                }}
              />
              <p className="mt-2 text-center text-xs text-neutral-500">
                {!pickTarget
                  ? 'Pick a customer, or visit without one'
                  : pickTarget.far && pickTarget.distance != null
                    ? `${pickTarget.name} is ${formatDistance(pickTarget.distance)} away — you’ll be asked to confirm.`
                    : `Checking in at ${pickTarget.name}${pickTarget.distance != null ? ` · ${formatDistance(pickTarget.distance)} away` : ''}`}
              </p>
            </>
          )}
        </div>
      </div>

      <CustomerInsightsSheet
        open={insightsOpen && !!insightsId}
        insights={insights}
        fallbackName={(step === 'record' ? customerName : pickTarget?.name) ?? 'Customer'}
        onClose={() => setInsightsOpen(false)}
        onOpenCustomer={
          step === 'record'
            ? undefined
            : () => {
                setInsightsOpen(false)
                onClose()
              }
        }
      />

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
          <button onClick={() => setFarCustomer(null)} className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target">
            Cancel
          </button>
        </div>
      </BottomSheet>
    </div>,
    document.body
  )
}

function RecordStep({
  customerName,
  customerSub,
  insightsTeaser,
  onOpenInsights,
  visitId,
  checkedInAt,
  byKind,
  visitTypeId,
  visitStatusId,
  orderStatusId,
  paymentStatusId,
  nextAppointment,
  customDate,
  remarks,
  orderLabel,
  paymentLabel,
  orderAmount,
  collected,
  busy,
  onOrderAmount,
  onCollected,
  onVisitType,
  onVisitStatus,
  onOrderStatus,
  onPaymentStatus,
  onNextVisitPreset,
  onClearNext,
  onCustomDate,
  onRemarks,
  onReselect,
  onCancelCheckIn,
}: {
  customerName: string | null | undefined
  customerSub: string
  insightsTeaser: string | null
  onOpenInsights: () => void
  visitId: string | null
  checkedInAt: string | null
  byKind: Record<VisitOptionKind, VisitOption[]>
  visitTypeId: string | null
  visitStatusId: string | null
  orderStatusId: string | null
  paymentStatusId: string | null
  nextAppointment: string | null
  customDate: string
  remarks: string
  orderLabel: string | undefined
  paymentLabel: string | undefined
  orderAmount: string
  collected: string
  busy: boolean
  onOrderAmount: (value: string) => void
  onCollected: (value: string) => void
  onVisitType: (id: string | null) => void
  onVisitStatus: (id: string | null) => void
  onOrderStatus: (id: string | null) => void
  onPaymentStatus: (id: string | null) => void
  onNextVisitPreset: (days: number) => void
  onClearNext: () => void
  onCustomDate: (value: string) => void
  onRemarks: (value: string) => void
  onReselect: () => void
  onCancelCheckIn: () => void
}) {
  const [nextPreset, setNextPreset] = useState<number | 'pick' | null>(null)
  return (
    <div className="flex flex-col gap-[18px] px-4 pt-1">
      <section aria-label="Customer" className="flex flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-brand-500 text-white">
            <Store className="h-[22px] w-[22px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-neutral-900">{customerName ?? 'No customer'}</span>
            {customerSub && <span className="block truncate text-xs text-neutral-500">{customerSub}</span>}
            <span className="block text-xs text-neutral-500">
              Checked in {checkedInAt ? formatTime(checkedInAt) : '—'}
              {checkedInAt && ` · ${formatDuration(Date.now() - new Date(checkedInAt).getTime())} so far`}
            </span>
          </span>
        </div>
        {insightsTeaser && (
          <button type="button" onClick={onOpenInsights} aria-haspopup="dialog" className="flex items-center gap-2.5 rounded-[14px] bg-brand-50 px-3.5 py-2.5 text-left text-brand-700">
            <Info className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Customer insights</span>
              <span className="block truncate text-xs opacity-85">{insightsTeaser}</span>
            </span>
            <span className="text-[13px] font-bold text-brand-500">Open</span>
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
          <span className="text-xs text-neutral-500">Wrong shop, or checked in by mistake?</span>
          <span className="flex gap-1.5">
            <button onClick={onReselect} disabled={busy} className="h-8 rounded-full border border-neutral-200 px-3 text-xs font-bold text-neutral-700 disabled:opacity-50">
              Change shop
            </button>
            <button onClick={onCancelCheckIn} disabled={busy} className="h-8 rounded-full border border-status-danger/30 px-3 text-xs font-bold text-status-danger disabled:opacity-50">
              Cancel visit
            </button>
          </span>
        </div>
      </section>

      <section aria-label="Outcome" className="flex flex-col gap-4">
        <ChipGroup label="Type of visit" options={byKind.visit_type} value={visitTypeId} onChange={onVisitType} />
        <ChipGroup label="Visit status" options={byKind.visit_status} value={visitStatusId} onChange={onVisitStatus} />
        <ChipGroup label="Order status" options={byKind.order_status} value={orderStatusId} onChange={onOrderStatus} />
        <ChipGroup label="Payment status" options={byKind.payment_status} value={paymentStatusId} onChange={onPaymentStatus} />
      </section>
      <AmountFields orderLabel={orderLabel} paymentLabel={paymentLabel} orderAmount={orderAmount} collected={collected} onOrderAmount={onOrderAmount} onCollected={onCollected} />
      {visitId && <VisitPhotoStrip visitId={visitId} editable />}

      <section aria-label="Next visit">
        <GroupLabel text="Next visit" />
        <div role="radiogroup" aria-label="Next visit" className="flex flex-wrap gap-2">
          {[...NEXT_VISIT_PRESETS.slice(0, 3).map((p) => ({ key: p.days as number | 'pick', label: p.label })), { key: 'pick' as const, label: 'Pick a date' }].map((o) => {
            const on = nextPreset === o.key
            return (
              <Chip
                key={String(o.key)}
                on={on}
                label={o.label}
                onClick={() => {
                  if (on) {
                    setNextPreset(null)
                    onClearNext()
                  } else {
                    setNextPreset(o.key)
                    if (o.key === 'pick') onClearNext()
                    else onNextVisitPreset(o.key)
                  }
                }}
              />
            )
          })}
        </div>
        {nextPreset === 'pick' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => onCustomDate(e.target.value)}
            aria-label="Next visit date"
            className="mt-2 h-11 w-full rounded-xl border-[1.5px] border-neutral-300 bg-white px-3 text-[15px] text-neutral-900 dark:bg-neutral-950"
          />
        )}
        <p className="mt-2 text-xs text-neutral-500">{nextAppointment ? `Scheduled: ${formatDate(nextAppointment)} · added to your plan` : 'No next visit scheduled'}</p>
      </section>

      <section aria-label="Remarks">
        <GroupLabel text="Remarks" />
        <textarea
          value={remarks}
          onChange={(e) => onRemarks(e.target.value)}
          rows={3}
          aria-label="Remarks"
          placeholder="Anything worth noting about this visit…"
          className="w-full rounded-[14px] border-[1.5px] border-neutral-300 bg-white p-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-500 dark:bg-neutral-950"
        />
      </section>
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> Auto check-out is on — you’re checked out if you move away from here.
      </p>
    </div>
  )
}

function GroupLabel({ text }: { text: string }) {
  return (
    <p className="mb-2 text-[13px] font-bold text-neutral-900">
      {text} <span className="font-semibold text-neutral-500">· optional</span>
    </p>
  )
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm tap-target ${on ? 'bg-brand-500 font-bold text-white' : 'bg-neutral-100 font-semibold text-neutral-700'}`}
    >
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
      {label}
    </button>
  )
}

function ChipGroup({ label, options, value, onChange }: { label: string; options: VisitOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const { tValue } = useLanguage()
  return (
    <div role="radiogroup" aria-label={label}>
      <GroupLabel text={label} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.id} on={value === o.id} label={tValue(`visitOption:${o.id}`, o.label)} onClick={() => onChange(value === o.id ? null : o.id)} />
        ))}
        {options.length === 0 && <p className="text-xs text-neutral-500">No options configured.</p>}
      </div>
    </div>
  )
}
