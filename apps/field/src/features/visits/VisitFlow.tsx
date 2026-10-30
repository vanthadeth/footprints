import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, Check, ChevronLeft, ChevronRight, Info, Loader2, Lock, MapPin, RefreshCw, Search, Store, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SlideToConfirm } from '@/components/SlideToConfirm'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useAppSettings } from '@/hooks/useAppSettings'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { formatDistance } from '@footprints/shared/lib/geo'
import { formatDate, formatDuration, formatTime, isPastTimeOfDay } from '@footprints/shared/lib/datetime'
import { haptic } from '@footprints/shared/lib/haptic'
import { usePlan } from '@/features/plan/usePlan'
import { todayDateString } from '@/lib/dateRange'
import { useVisitOptions } from './useVisitOptions'
import type { VisitOption, VisitOptionKind } from './visitOptionsService'
import { visitsService, type NearbyCustomer, type VisitOutcomeDetails } from './visitsService'
import { AmountFields } from './AmountFields'
import { VisitPhotoStrip } from './VisitPhotoStrip'
import { outcomeFields, parseAmount } from './visitOutcome'
import { GPS_LEVEL_COPY, gpsLevel } from '@/features/location/gpsLevel'
import { GpsRadar } from '@/features/location/GpsRadar'
import { CustomerInsightsSheet } from './CustomerInsightsSheet'
import { insightsTeaser, useCustomerInsights } from './customerInsights'

type Step = 'picker' | 'confirm' | 'record'

/** A customer already chosen before the flow opened (Home's Next Customer card, a Customer detail page's VISIT button) -- skips the nearby-picker step and goes straight to a one-tap confirm. */
export interface PresetCustomer {
  id: string
  shopName: string
}

const NEXT_VISIT_PRESETS: { days: number }[] = [{ days: 1 }, { days: 3 }, { days: 7 }, { days: 14 }]
const PRESET_KEY: Record<number, string> = { 1: 'visitFlow.presetTomorrow', 3: 'visitFlow.presetIn3Days', 7: 'visitFlow.presetNextWeek', 14: 'visitFlow.presetIn2Weeks' }

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

  const { t } = useLanguage()
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
          ? t('visitFlow.locPermission')
          : t('visitFlow.locFailed')
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
  // The server refuses customer check-in/out outside the admin's hours (app.within_check_window); say so up front.
  const checkWindowOpen = isPastTimeOfDay(settings.checkWindowStart) && !isPastTimeOfDay(settings.checkWindowEnd)
  const checkWindowText = t('visitFlow.checkWindow', { start: settings.checkWindowStart.slice(0, 5), end: settings.checkWindowEnd.slice(0, 5) })
  const pickBlocked = journey.busy || accuracyTooLow || locState !== 'ready' || !checkWindowOpen
  const pickTarget = step === 'confirm' && presetCustomer ? { id: presetCustomer.id, name: presetCustomer.shopName, far: false, distance: null as number | null } : selected ? { id: selected.id, name: selected.shop_name, far: selected.distance_m > settings.checkinRadiusM, distance: selected.distance_m } : null
  const filtered = query.trim() ? customers.filter((c) => c.shop_name.toLowerCase().includes(query.trim().toLowerCase())) : customers

  // Portaled to <body> for the same reason BottomSheet is: rendered inline
  // inside AppLayout's per-page `animate-fade-in-up` wrapper, this "fixed"
  // overlay would be clipped to that wrapper's own content box rather than
  // the full viewport, since its `transform` (present even at rest -- the
  // animation's fill-mode is `both`) makes it the containing block for any
  // `position: fixed` descendant.
  const sharedSheets = (
    <>
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

      <BottomSheet open={farCustomer !== null} onClose={() => setFarCustomer(null)} title={t('visitFlow.farTitle')}>
        <div className="p-4">
          <p className="text-sm text-neutral-600">
            {t('visitFlow.farBody', { name: farCustomer?.shop_name ?? '', distance: farCustomer ? formatDistance(farCustomer.distance_m) : '', range: formatDistance(settings.checkinRadiusM) })}
          </p>
          <button
            onClick={handleConfirmFarCheckIn}
            disabled={journey.busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-status-warn py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
          >
            {journey.busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {journey.busy ? t('visitFlow.checkingIn') : t('visitFlow.checkInAnyway')}
          </button>
          <button onClick={() => setFarCustomer(null)} className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target">
            {t('common.cancel')}
          </button>
        </div>
      </BottomSheet>
    </>
  )

  if (step !== 'record') {
    const gpsPending = locState !== 'ready' || accuracyTooLow
    const gpsWarn = locState === 'error' || accuracyTooLow
    const planByCustomer = new Map(planItems.map((i) => [i.customer_id, i]))
    const nextPlanned = planItems.find((i) => i.status === 'planned')?.customer_id ?? null
    const tagOf = (id: string): { text: string; cls: string } => {
      const plan = planByCustomer.get(id)
      if (plan?.appointment_at) return { text: t('checkIn.tagAppt', { time: formatTime(plan.appointment_at) }), cls: 'bg-brand-50 text-brand-700' }
      if (id === nextPlanned) return { text: t('checkIn.tagNextStop'), cls: 'bg-status-working/10 text-status-working' }
      if (plan?.status === 'planned') return { text: t('checkIn.tagPlan'), cls: 'bg-status-working/10 text-status-working' }
      return { text: t('checkIn.tagNone'), cls: 'bg-neutral-200 text-neutral-600' }
    }
    const headerSub = gpsPending ? t('checkIn.gpsCheck') : presetCustomer ? t('checkIn.gpsAcc', { n: Math.round(accuracy ?? 0) }) : t('checkIn.nearbyCount', { n: customers.length, gps: t('checkIn.gpsAcc', { n: Math.round(accuracy ?? 0) }) })
    const go = () => {
      if (!pickTarget) return
      if (selected && step === 'picker') handleSelectCustomer(selected)
      else void journey.startVisit(pickTarget.id)
    }
    return (
      <>
        <BottomSheet
          open
          onClose={onClose}
          title={t('checkIn.checkInAt')}
          header={
            <div className="px-5 pb-3 pt-2.5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
          <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[22px] font-extrabold leading-7 text-neutral-900">{t('checkIn.checkInAt')}</h2>
                <p aria-live="polite" className="mt-1 text-[13px] font-semibold text-neutral-500">
                  {headerSub}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
                <X className="h-5 w-5" />
              </button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-2.5 px-5 pb-5">
            {journey.error && (
              <div role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2.5 text-sm font-semibold text-status-danger">
                {journey.error}
              </div>
            )}
            {gpsPending ? (
              <GpsRadar
                checking={locState === 'loading'}
                accuracy={accuracy}
                warn={gpsWarn}
                title={locState === 'loading' ? t('checkInFlow.findingYou') : accuracy != null ? t(GPS_LEVEL_COPY[gpsLevel(accuracy)].title) : (locError ?? t('checkIn.locationError'))}
                hint={locState === 'loading' ? t('checkInFlow.checkingGps') : accuracy != null ? t(GPS_LEVEL_COPY[gpsLevel(accuracy)].hint) : ''}
                onRefresh={refreshLocation}
              />
            ) : step === 'confirm' && presetCustomer ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-500 bg-brand-50 px-3.5 py-3">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-neutral-900">{presetCustomer.shopName}</span>
              </div>
            ) : (
              <>
                {filtered.length === 0 && <p className="rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-500">{t('checkIn.noneNearby')}</p>}
                <div role="radiogroup" aria-label="Customer" className="flex flex-col gap-2.5">
                  {filtered.map((c) => {
                    const on = c.id === selectedId
                    const tag = tagOf(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setSelectedId(c.id)}
                        className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left ${on ? 'border-brand-500 bg-brand-50' : 'border-transparent bg-neutral-100'}`}
                      >
                        <span
                          aria-hidden
                          className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${on ? 'border-brand-500 bg-brand-500 shadow-[inset_0_0_0_4px_#fff]' : 'border-neutral-400'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-neutral-900">{c.shop_name}</span>
                          <span className="block truncate text-xs text-neutral-500">{[c.business_type, c.street_address].filter(Boolean).join(' · ')}</span>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${tag.cls}`}>{tag.text}</span>
                        </span>
                        <span className="shrink-0 text-sm font-extrabold text-neutral-900">{formatDistance(c.distance_m)}</span>
                      </button>
                    )
                  })}
                </div>
                {customers.length > 3 && (
                  <label className="flex h-11 items-center gap-2.5 rounded-[14px] bg-neutral-100 px-3.5">
                    <Search className="h-[18px] w-[18px] shrink-0 text-neutral-500" aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('checkIn.searchAll')}
                      aria-label={t('checkIn.searchAll')}
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
                    />
                  </label>
                )}
              </>
            )}
            {!checkWindowOpen && <p className="text-center text-xs text-neutral-500">{checkWindowText}</p>}
            <button
              type="button"
              onClick={go}
              disabled={pickBlocked || !pickTarget}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-extrabold text-white disabled:opacity-50"
            >
              {journey.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <MapPin className="h-5 w-5" aria-hidden />}
              {pickTarget && !gpsPending ? t('checkIn.checkInAtName', { name: pickTarget.name }) : t('checkIn.checkInButton')}
            </button>
            {!presetCustomer && !gpsPending && (
              <button type="button" onClick={() => journey.startVisit(null)} disabled={pickBlocked} className="text-center text-[13px] font-bold text-neutral-500 disabled:opacity-50">
                {t('checkIn.visitNoCustomer')}
              </button>
            )}
          </div>
        </BottomSheet>
        {sharedSheets}
      </>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-30 flex flex-col bg-neutral-50">
      <header style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }} className="grid grid-cols-[44px_1fr_44px] items-center px-3 pb-1.5">
        {step === 'record' ? (
          <span />
        ) : (
          <button onClick={onClose} aria-label={t('visitFlow.back')} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-900 tap-target">
            <ChevronLeft className="h-[22px] w-[22px]" />
          </button>
        )}
        <div className="text-center">
          <h1 className="text-[17px] font-bold text-neutral-900">{step === 'record' ? t('visitFlow.visitRecord') : t('checkIn.checkInButton')}</h1>
          {step === 'record' && <p className="text-xs text-neutral-500">{t('visitFlow.fillIn')}</p>}
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
                  {locState === 'loading' && t('visitFlow.findingLocation')}
                  {locState === 'ready' && (accuracy != null ? t(GPS_LEVEL_COPY[gpsLevel(accuracy)].title) : t('checkIn.currentLocation'))}
                  {locState === 'error' && (locError ?? t('visitFlow.locationUnavailable'))}
                </span>
                {locState === 'ready' && accuracy != null && (
                  <span className="mt-px block text-xs text-neutral-500">
                    {t(GPS_LEVEL_COPY[gpsLevel(accuracy)].hint)} · {t('checkIn.gpsAcc', { n: Math.round(accuracy) })}
                  </span>
                )}
              </span>
              <button
                onClick={refreshLocation}
                disabled={locState === 'loading'}
                aria-label={t('visitFlow.refreshLocation')}
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
                      placeholder={t('visitFlow.searchNearby')}
                      aria-label={t('visitFlow.searchNearby')}
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
                    />
                  </label>
                )}
                <section aria-label={t('visitFlow.nearestCustomers')}>
                  <p className="px-0.5 pb-2 pt-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
                    Nearest customers{locState === 'ready' && customers.length > 0 ? ` · ${customers.length} nearby` : ''}
                  </p>
                  {locState === 'loading' && (
                    <div className="space-y-2">
                      <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
                      <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
                      <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
                    </div>
                  )}
                  {locState === 'ready' && filtered.length === 0 && (
                    <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm text-neutral-500 shadow-card">{t('checkIn.noneNearby')}</p>
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
                                {plannedIds.has(c.id) && <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10.5px] font-bold text-brand-700">{t('visitFlow.planned')}</span>}
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
                                <span className="block text-sm font-bold">{t('visitFlow.knowBefore')}</span>
                                <span className="block truncate text-xs opacity-85">{insights.loading ? 'Loading…' : insightsTeaser(insights)}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[13px] font-bold text-brand-500">
                                {t('visitFlow.insights')}
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
              <SlideToConfirm label={journey.busy ? t('visitFlow.checkingOut') : t('visitFlow.slideCheckOut')} variant="danger" busy={journey.busy} disabled={!checkWindowOpen} onConfirm={handleConfirm} />
              <p className="mt-2 text-center text-xs text-neutral-500">
                {checkWindowOpen ? t('visitFlow.allOptional') : `${checkWindowText} ${t('visitFlow.clockOutToClose')}`}
              </p>
            </>
          ) : (
            <>
              <SlideToConfirm
                label={journey.busy ? t('visitFlow.checkingIn') : pickTarget ? t('visitFlow.slideCheckInAt', { name: pickTarget.name }) : t('visitFlow.slideCheckIn')}
                busy={journey.busy}
                disabled={pickBlocked || !pickTarget}
                onConfirm={() => {
                  if (!pickTarget) return
                  if (selected && step === 'picker') handleSelectCustomer(selected)
                  else void journey.startVisit(pickTarget.id)
                }}
              />
              <p className="mt-2 text-center text-xs text-neutral-500">
                {!checkWindowOpen
                  ? checkWindowText
                  : !pickTarget
                  ? t('visitFlow.pickCustomer')
                  : pickTarget.far && pickTarget.distance != null
                    ? t('visitFlow.farConfirm', { name: pickTarget.name, distance: formatDistance(pickTarget.distance) })
                    : pickTarget.distance != null ? t('visitFlow.checkingInAtFar', { name: pickTarget.name, distance: formatDistance(pickTarget.distance) }) : t('visitFlow.checkingInAt', { name: pickTarget.name })}
              </p>
            </>
          )}
        </div>
      </div>

      {sharedSheets}
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
  const { t } = useLanguage()
  const [nextPreset, setNextPreset] = useState<number | 'pick' | null>(null)
  return (
    <div className="flex flex-col gap-[18px] px-4 pt-1">
      <section aria-label="Customer" className="flex flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-brand-500 text-white">
            <Store className="h-[22px] w-[22px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-neutral-900">{customerName ?? t('visitFlow.noCustomer')}</span>
            {customerSub && <span className="block truncate text-xs text-neutral-500">{customerSub}</span>}
            <span className="block text-xs text-neutral-500">
              {t('checkIn.checkedInAt', { time: checkedInAt ? formatTime(checkedInAt) : '—' })}
              {checkedInAt && ` · ${t('visitFlow.soFar', { duration: formatDuration(Date.now() - new Date(checkedInAt).getTime()) })}`}
            </span>
          </span>
        </div>
        {insightsTeaser && (
          <button type="button" onClick={onOpenInsights} aria-haspopup="dialog" className="flex items-center gap-2.5 rounded-[14px] bg-brand-50 px-3.5 py-2.5 text-left text-brand-700">
            <Info className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{t('visitFlow.customerInsights')}</span>
              <span className="block truncate text-xs opacity-85">{insightsTeaser}</span>
            </span>
            <span className="text-[13px] font-bold text-brand-500">{t('visitFlow.open')}</span>
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
          <span className="text-xs text-neutral-500">{t('visitFlow.wrongShop')}</span>
          <span className="flex gap-1.5">
            <button onClick={onReselect} disabled={busy} className="h-8 rounded-full border border-neutral-200 px-3 text-xs font-bold text-neutral-700 disabled:opacity-50">
              {t('visitFlow.changeShop')}
            </button>
            <button onClick={onCancelCheckIn} disabled={busy} className="h-8 rounded-full border border-status-danger/30 px-3 text-xs font-bold text-status-danger disabled:opacity-50">
              {t('visitFlow.cancelVisit')}
            </button>
          </span>
        </div>
      </section>

      <section aria-label="Outcome" className="flex flex-col gap-4">
        <ChipGroup label={t('visitFlow.typeOfVisit')} options={byKind.visit_type} value={visitTypeId} onChange={onVisitType} />
        <ChipGroup label={t('visitFlow.visitStatus')} options={byKind.visit_status} value={visitStatusId} onChange={onVisitStatus} />
        <ChipGroup label={t('visitFlow.orderStatus')} options={byKind.order_status} value={orderStatusId} onChange={onOrderStatus} />
        <ChipGroup label={t('visitFlow.paymentStatus')} options={byKind.payment_status} value={paymentStatusId} onChange={onPaymentStatus} />
      </section>
      <AmountFields orderLabel={orderLabel} paymentLabel={paymentLabel} orderAmount={orderAmount} collected={collected} onOrderAmount={onOrderAmount} onCollected={onCollected} />
      <section aria-label={t('visitFlow.note')}>
        <GroupLabel text={t('visitFlow.note')} />
        <textarea
          value={remarks}
          onChange={(e) => onRemarks(e.target.value)}
          rows={3}
          aria-label={t('visitFlow.note')}
          placeholder={t('visitFlow.notePlaceholder')}
          className="w-full rounded-[14px] border-[1.5px] border-neutral-300 bg-white p-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-500 dark:bg-neutral-950"
        />
      </section>
      {visitId && <VisitPhotoStrip visitId={visitId} editable />}

      <section aria-label={t('visitFlow.nextVisit')}>
        <GroupLabel text={t('visitFlow.nextVisit')} />
        <div role="radiogroup" aria-label={t('visitFlow.nextVisit')} className="flex flex-wrap gap-2">
          {[...NEXT_VISIT_PRESETS.slice(0, 3).map((p) => ({ key: p.days as number | 'pick', label: t(PRESET_KEY[p.days]) })), { key: 'pick' as const, label: t('visitFlow.pickDate') }].map((o) => {
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
            aria-label={t('visitFlow.nextVisitDate')}
            className="mt-2 h-11 w-full rounded-xl border-[1.5px] border-neutral-300 bg-white px-3 text-[15px] text-neutral-900 dark:bg-neutral-950"
          />
        )}
        <p className="mt-2 text-xs text-neutral-500">{nextAppointment ? `Scheduled: ${formatDate(nextAppointment)} · added to your plan` : 'No next visit scheduled'}</p>
      </section>

      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> {t('visitFlow.autoCheckout')}
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
  const { t, tValue } = useLanguage()
  return (
    <div role="radiogroup" aria-label={label}>
      <GroupLabel text={label} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.id} on={value === o.id} label={tValue(`visitOption:${o.id}`, o.label)} onClick={() => onChange(value === o.id ? null : o.id)} />
        ))}
        {options.length === 0 && <p className="text-xs text-neutral-500">{t('visitFlow.noOptions')}</p>}
      </div>
    </div>
  )
}
