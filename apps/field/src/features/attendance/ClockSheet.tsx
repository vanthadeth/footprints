import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, MapPin, RotateCcw, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SlideToConfirm } from '@/components/SlideToConfirm'
import { InlineSelfieCamera } from './InlineSelfieCamera'
import { useJourneyContext } from './JourneyContext'
import { computeJourneyStats } from './journeyStats'
import type { DayJourney } from './useJourneyHistory'
import { clockBlock, type ClockBlock } from '@footprints/shared/features/permissions/clockRules'
import type { RequiredLocation } from '@footprints/shared/features/permissions/permissionsService'
import { locationService } from '@/features/location/locationService'
import { GPS_LEVEL_COPY, gpsLevel } from '@/features/location/gpsLevel'
import { GpsRadar } from '@/features/location/GpsRadar'
import { useAppSettings } from '@/hooks/useAppSettings'
import { DayBar } from '@/features/fleet/DayBar'
import { atLocal, segmentsFor } from '@/features/fleet/dayBar'
import { todayDateString } from '@/lib/dateRange'
import { useLocations } from '@/features/locations/useLocations'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { distanceInMeters } from '@footprints/shared/lib/geo'
import { formatDuration, formatTime } from '@footprints/shared/lib/datetime'

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
  const [now, setNow] = useState(() => new Date())
  const [submitting, setSubmitting] = useState(false)

  async function checkLocation() {
    setLoc({ status: 'checking' })
    try {
      const r = await locationService.getCurrentPosition()
      // A rough fix blocks clock-in, but never clock-out -- the server just flags it (LOW_LOCATION_ACCURACY).
      if (r.accuracy > settings.maxLocationAccuracyM && direction === 'in') return setLoc({ status: 'low', accuracy: r.accuracy })
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
  const today: DayJourney = { date: '', attendance: journey.todaysAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today], undefined, null, settings.flagRules)

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

  const stage: 'gps' | 'camera' | 'confirm' = !locReady ? 'gps' : selfie ? 'confirm' : 'camera'
  const sub =
    stage === 'gps' ? t('checkIn.gpsCheck') : `${t('checkIn.stepOf', { n: stage === 'camera' ? 1 : 2, total: 2 })} · ${stage === 'camera' ? t('checkIn.tapShutter') : t('checkIn.stepConfirm')}`
  const title = isIn ? t('checkIn.clockInTitle') : t('checkIn.clockOutTitle')

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      header={
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-[22px] font-extrabold leading-7 text-neutral-900">{title}</h2>
            <p aria-live="polite" className="mt-1 text-[13px] font-semibold text-neutral-500">
              {sub}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-5">
        {!isIn && (
          <section aria-label={t('checkIn.yourDay')} className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('checkIn.yourDay')}</p>
              <p className={`text-xs font-semibold ${journey.openVisit ? 'text-status-warn' : 'text-neutral-500'}`}>{journey.openVisit ? t('checkIn.visitOpen') : t('checkIn.noOpenVisit')}</p>
            </div>
            <div className="mt-2.5 grid grid-cols-3">
              <DayStat label={t('checkIn.worked')} value={formatDuration(stats.totalWorkingMs, language)} />
              <DayStat label={t('nav.visits')} value={String(stats.totalVisits)} border />
              <DayStat label={t('checkIn.statActive')} value={formatDuration(stats.totalVisitingMs, language)} border />
            </div>
            {journey.openAttendance && <ClockOutDayBar attendance={journey.todaysAttendance} visits={journey.todaysVisits} now={now.getTime()} />}
          </section>
        )}

        {stage === 'gps' && (
          <GpsRadar
            checking={loc.status === 'checking'}
            accuracy={'accuracy' in loc ? loc.accuracy : null}
            warn={loc.status === 'low' || loc.status === 'blocked'}
            title={loc.status === 'checking' ? t('checkInFlow.findingYou') : loc.status === 'low' ? t(GPS_LEVEL_COPY[gpsLevel(loc.accuracy)].title) : t('checkIn.currentLocation')}
            hint={
              loc.status === 'checking'
                ? t('checkInFlow.checkingGps')
                : loc.status === 'low'
                  ? t(GPS_LEVEL_COPY[gpsLevel(loc.accuracy)].hint)
                  : loc.status === 'blocked'
                    ? t('checkIn.locationBlocked', { places: loc.block.names, nearest: loc.block.nearest, distance: loc.block.distance })
                    : ''
            }
            onRefresh={() => void checkLocation()}
          />
        )}
        {stage === 'camera' && open && <InlineSelfieCamera onCapture={(blob) => setSelfie((cur) => {
          if (cur) URL.revokeObjectURL(cur.url)
          return { blob, url: URL.createObjectURL(blob) }
        })} />}
        {stage === 'confirm' && selfie && (
          <div className="relative h-[330px] overflow-hidden rounded-[22px] bg-[#0e0f12]">
            <img src={selfie.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-3 left-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-status-working px-3.5 text-[13px] font-bold text-white">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
              {t('checkIn.selfieTaken')}
            </span>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(selfie.url)
                setSelfie(null)
              }}
              className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/45 px-3.5 text-[13px] font-bold text-white backdrop-blur"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {t('checkIn.retake')}
            </button>
          </div>
        )}

        <section aria-label={t('checkIn.stepLocation')} className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-3.5 py-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${loc.status === 'ok' ? 'bg-status-working/10 text-status-working' : 'bg-white text-neutral-500'}`}>
            {loc.status === 'checking' ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : loc.status === 'ok' ? <MapPin className="h-[18px] w-[18px]" /> : <AlertTriangle className="h-[18px] w-[18px] text-status-warn" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-neutral-900">{loc.status === 'ok' && loc.place ? loc.place : t('checkIn.currentLocation')}</span>
            <span className={`flex items-center gap-1 text-xs font-bold ${loc.status === 'ok' ? 'text-status-working' : loc.status === 'checking' ? 'text-neutral-500' : 'text-status-warn'}`}>
              {loc.status === 'ok' && <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />}
              <span className="truncate">
                {loc.status === 'checking' && t('checkIn.locationChecking')}
                {loc.status === 'ok' && `${t('checkIn.insideArea')} · ${t('checkIn.gpsAcc', { n: Math.round(loc.accuracy) })}`}
                {loc.status === 'low' && t(GPS_LEVEL_COPY[gpsLevel(loc.accuracy)].title)}
                {loc.status === 'error' && t('checkIn.locationError')}
                {loc.status === 'blocked' && t('checkIn.locationBlocked', { places: loc.block.names, nearest: loc.block.nearest, distance: loc.block.distance })}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-600">{formatTime(now.toISOString())}</span>
        </section>

        {journey.error && (
          <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2.5 text-[13px] font-semibold text-status-danger">
            {journey.error}
          </p>
        )}

        <SlideToConfirm
          label={stage === 'confirm' ? (isIn ? t('checkIn.slideConfirmIn') : t('checkIn.slideConfirmOut')) : isIn ? t('checkIn.slideToClockIn') : t('checkIn.slideToClockOut')}
          variant={isIn ? 'soft' : 'danger'}
          disabled={!ready}
          busy={submitting || journey.busy}
          onConfirm={() => void confirm()}
        />
      </div>
    </BottomSheet>
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

/** The day being closed, clock-in to now, as the canvas's bar (Polish › Clock out), with In / Out under it. */
function ClockOutDayBar({ attendance, visits, now }: { attendance: DayJourney['attendance']; visits: DayJourney['visits']; now: number }) {
  const settings = useAppSettings()
  const { t } = useLanguage()
  const day = todayDateString()
  const { segs, live, clockIn } = segmentsFor({
    attendance,
    visits,
    shiftStart: atLocal(day, settings.workStartTime),
    shiftEnd: atLocal(day, settings.workEndTime),
    now,
    flagRules: settings.flagRules,
  })
  if (clockIn == null) return null
  // Clocking out now: nothing is still to come.
  const done = segs.filter((g) => g.kind !== 'todo')
  return (
    <div className="mt-3.5">
      <DayBar segs={done} from={clockIn} to={now} size="md" label={`${live.length} ${live.length === 1 ? 'visit' : 'visits'} since ${formatTime(new Date(clockIn).toISOString())}`} />
      <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
        <span>{t('checkInFlow.inAt', { time: formatTime(new Date(clockIn).toISOString()) })}</span>
        <span>{t('checkInFlow.outAt', { time: formatTime(new Date(now).toISOString()) })}</span>
      </div>
    </div>
  )
}
