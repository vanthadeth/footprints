import { useEffect, useState } from 'react'
import { AlertTriangle, Camera, Check, Loader2, MapPin, RotateCcw, X } from 'lucide-react'
import { FullScreenSheet } from '@/components/FullScreenSheet'
import { SlideToConfirm } from '@/components/SlideToConfirm'
import { SelfieCaptureSheet } from './SelfieCaptureSheet'
import { useJourneyContext } from './JourneyContext'
import { computeJourneyStats } from './journeyStats'
import type { DayJourney } from './useJourneyHistory'
import { clockBlock, type ClockBlock } from '@/features/permissions/clockRules'
import type { RequiredLocation } from '@/features/permissions/permissionsService'
import { locationService } from '@/features/location/locationService'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useLocations } from '@/features/locations/useLocations'
import { useLanguage } from '@/i18n/LanguageContext'
import { distanceInMeters } from '@/lib/geo'
import { formatDuration, formatLongDate, formatTime } from '@/lib/datetime'

type Direction = 'in' | 'out'
type LocState =
  | { status: 'checking' }
  | { status: 'ok'; accuracy: number; place: string | null }
  | { status: 'low'; accuracy: number }
  | { status: 'blocked'; accuracy: number; block: ClockBlock }
  | { status: 'error' }

/** The required location the person is standing in, if any (for the "Head office" line). */
function placeAt(required: RequiredLocation[], lat: number, lng: number): string | null {
  return required.find((l) => distanceInMeters(lat, lng, l.latitude, l.longitude) <= l.radius_m)?.name ?? null
}

/**
 * Clock in / clock out as one full screen, laid out like the design canvas
 * (Polish › Clock in, Clock out): the time, three steps (location, selfie,
 * confirm), a location card with GPS accuracy and Refresh, a selfie card,
 * then "Slide to clock in/out" once both are done. The location check here
 * only explains problems early -- app.clock_in / app.clock_out stay the guard.
 */
export function ClockSheet({ open, direction, required, onClose }: { open: boolean; direction: Direction; required: RequiredLocation[]; onClose: () => void }) {
  const journey = useJourneyContext()
  const settings = useAppSettings()
  const { locations } = useLocations()
  const { t, language } = useLanguage()
  const [loc, setLoc] = useState<LocState>({ status: 'checking' })
  const [selfie, setSelfie] = useState<{ blob: Blob; url: string } | null>(null)
  const [camera, setCamera] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [submitting, setSubmitting] = useState(false)

  async function checkLocation() {
    setLoc({ status: 'checking' })
    try {
      const r = await locationService.getCurrentPosition()
      if (r.accuracy > settings.maxLocationAccuracyM) return setLoc({ status: 'low', accuracy: r.accuracy })
      const block = clockBlock(required, r)
      if (block) return setLoc({ status: 'blocked', accuracy: r.accuracy, block })
      setLoc({ status: 'ok', accuracy: r.accuracy, place: placeAt(required.length ? required : locations.filter((l) => l.active), r.latitude, r.longitude) })
    } catch {
      setLoc({ status: 'error' })
    }
  }

  useEffect(() => {
    if (!open) {
      setSelfie((s) => {
        if (s) URL.revokeObjectURL(s.url)
        return null
      })
      return
    }
    void checkLocation()
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
    // checkLocation reads the latest rules/settings each time it runs; re-running on every render isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direction])

  const isIn = direction === 'in'
  // A failed reading doesn't block: the clock-in RPC re-reads the location and reports the real problem.
  const locReady = loc.status === 'ok' || loc.status === 'error'
  const ready = locReady && !!selfie
  const steps = [
    { label: t('checkIn.stepLocation'), done: locReady },
    { label: t('checkIn.stepSelfie'), done: !!selfie },
    { label: t('checkIn.stepConfirm'), done: false },
  ]
  const today: DayJourney = { date: '', attendance: journey.todaysAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today])
  const shift = t('checkIn.shift', { start: settings.workStartTime.slice(0, 5), end: settings.workEndTime.slice(0, 5) })

  async function confirm() {
    if (!selfie || submitting) return
    setSubmitting(true)
    try {
      if (isIn) await journey.clockIn(selfie.blob)
      else await journey.clockOut(selfie.blob)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FullScreenSheet open={open} onClose={onClose} label={isIn ? t('checkIn.clockInTitle') : t('checkIn.clockOutTitle')} showClose={false}>
      <div className="flex h-full flex-col overflow-y-auto bg-neutral-50 safe-top">
        <header className="grid grid-cols-[44px_1fr_44px] items-center px-3 pb-1.5 pt-2.5">
          <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-900">
            <X className="h-[22px] w-[22px]" />
          </button>
          <h1 className="text-center text-[17px] font-bold text-neutral-900">{isIn ? t('checkIn.clockInTitle') : t('checkIn.clockOutTitle')}</h1>
          <span />
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3.5 px-4 pb-44 pt-2">
          <div className="text-center">
            <p className="text-[52px] font-extrabold leading-[58px] tracking-tight tabular-nums text-neutral-900">{formatTime(now.toISOString())}</p>
            <p className="text-sm text-neutral-500">
              {formatLongDate(now.toISOString(), undefined, language)} · {shift}
            </p>
          </div>

          <ol aria-label="Steps" className="flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-1.5 text-[13px] font-semibold text-neutral-600">
                {i > 0 && <span aria-hidden className="mr-0.5 h-px w-4 bg-neutral-300" />}
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-extrabold ${
                    s.done ? 'bg-status-working text-white' : 'border-[1.5px] border-neutral-300 text-neutral-500'
                  }`}
                >
                  {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
              </li>
            ))}
          </ol>

          {!isIn && (
            <section aria-label={t('checkIn.yourDay')} className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('checkIn.yourDay')}</p>
                <p className={`text-xs font-semibold ${journey.openVisit ? 'text-status-warn' : 'text-neutral-500'}`}>
                  {journey.openVisit ? t('checkIn.visitOpen') : t('checkIn.noOpenVisit')}
                </p>
              </div>
              <div className="mt-2.5 grid grid-cols-3">
                <DayStat label={t('checkIn.worked')} value={formatDuration(stats.totalWorkingMs, language)} />
                <DayStat label={t('nav.visits')} value={String(stats.totalVisits)} border />
                <DayStat label={t('checkIn.statActive')} value={formatDuration(stats.totalVisitingMs, language)} border />
              </div>
              {journey.openAttendance && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-[13px] font-bold text-neutral-700">
                  <span>{t('checkInFlow.inAt', { time: formatTime(journey.openAttendance.clock_in_at) })}</span>
                  <span className="text-neutral-400">→</span>
                  <span>{t('checkInFlow.outAt', { time: formatTime(now.toISOString()) })}</span>
                </div>
              )}
            </section>
          )}

          <section aria-label={t('checkIn.stepLocation')} className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                loc.status === 'ok' ? 'bg-status-working/10 text-status-working' : loc.status === 'checking' ? 'bg-brand-50 text-brand-500' : 'bg-status-warn/10 text-status-warn'
              }`}
            >
              {loc.status === 'checking' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : loc.status === 'ok' ? (
                <MapPin className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-neutral-900">
                {loc.status === 'ok' && loc.place ? loc.place : t('checkIn.currentLocation')}
              </span>
              <span className={`block text-xs ${loc.status === 'ok' ? 'text-status-working' : loc.status === 'checking' ? 'text-neutral-500' : 'text-status-warn'}`}>
                {loc.status === 'checking' && t('checkIn.locationChecking')}
                {loc.status === 'ok' && t('checkIn.insideArea')}
                {loc.status === 'low' && t('checkIn.locationLow')}
                {loc.status === 'error' && t('checkIn.locationError')}
                {loc.status === 'blocked' && t('checkIn.locationBlocked', { places: loc.block.names, nearest: loc.block.nearest, distance: loc.block.distance })}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              {'accuracy' in loc && <span className="text-[11px] font-semibold text-neutral-500">{t('checkIn.gpsAcc', { n: Math.round(loc.accuracy) })}</span>}
              <button type="button" onClick={() => void checkLocation()} disabled={loc.status === 'checking'} className="text-[13px] font-bold text-brand-500 disabled:opacity-50">
                {t('checkIn.refresh')}
              </button>
            </span>
          </section>

          <section aria-label={t('checkIn.stepSelfie')} className="flex items-center gap-3.5 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
            <span className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-neutral-500">
              {selfie ? <img src={selfie.url} alt="" className="h-full w-full object-cover" /> : <Camera className="h-7 w-7" aria-hidden />}
              {selfie && (
                <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-status-working text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-neutral-900">{selfie ? t('checkIn.selfieDone') : t('checkIn.stepSelfie')}</span>
              <span className="block text-xs text-neutral-500">{t('checkIn.selfieTodo')}</span>
              <button
                type="button"
                onClick={() => setCamera(true)}
                className={`mt-2 inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold ${selfie ? 'border border-neutral-200 text-neutral-900' : 'bg-brand-500 text-white'}`}
              >
                {selfie ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                {selfie ? t('checkIn.retake') : t('checkIn.takeSelfie')}
              </button>
            </span>
          </section>

          {journey.error && (
            <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2.5 text-[13px] font-semibold text-status-danger">
              {journey.error}
            </p>
          )}
        </main>

        <div className="fixed inset-x-0 bottom-0 bg-neutral-50/95 px-4 pb-6 pt-3 backdrop-blur safe-bottom">
          <div className="mx-auto max-w-md">
            <SlideToConfirm
              label={isIn ? t('checkIn.slideToClockIn') : t('checkIn.slideToClockOut')}
              variant={isIn ? 'primary' : 'danger'}
              disabled={!ready}
              busy={submitting || journey.busy}
              onConfirm={() => void confirm()}
            />
            <p className="mt-2 text-center text-xs text-neutral-500">
              {!ready ? t('checkIn.needLocationSelfie') : isIn ? t('checkIn.confirmInNote') : journey.openVisit ? t('checkIn.alsoCheckOut') : t('checkIn.confirmOutNote')}
            </p>
          </div>
        </div>
      </div>

      <SelfieCaptureSheet
        open={camera}
        title={isIn ? t('checkIn.clockInSelfieTitle') : t('checkIn.clockOutSelfieTitle')}
        onCancel={() => setCamera(false)}
        onCapture={(blob) => {
          setSelfie((s) => {
            if (s) URL.revokeObjectURL(s.url)
            return { blob, url: URL.createObjectURL(blob) }
          })
          setCamera(false)
        }}
      />
    </FullScreenSheet>
  )
}

function DayStat({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={border ? 'border-l border-neutral-100 pl-3' : ''}>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="mt-0.5 text-[17px] font-extrabold text-neutral-900">{value}</p>
    </div>
  )
}
