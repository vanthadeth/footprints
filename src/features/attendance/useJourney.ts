import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { attendanceService } from './attendanceService'
import { visitsService, type VisitOutcomeDetails } from '@/features/visits/visitsService'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { useAppSettings } from '@/hooks/useAppSettings'
import { isPastTimeOfDay, startOfTodayIso } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'
import { deriveAttendanceStatus, deriveVisitStatus } from './stateMachine'
import type { AttendanceRow, JourneyState, VisitRow } from './types'

interface UseJourneyResult extends JourneyState {
  todaysVisits: VisitRow[]
  /** Every attendance session that started today, oldest first -- multiple clock-in/clock-out cycles per day are allowed. */
  todaysAttendance: AttendanceRow[]
  loading: boolean
  /** True while any write (clock in/out, check in/out) is in flight -- used to disable buttons and block duplicate taps. */
  busy: boolean
  error: string | null
  clockIn: (selfieBlob: Blob) => Promise<void>
  clockOut: (selfieBlob: Blob) => Promise<void>
  startVisit: (customerId: string | null) => Promise<void>
  endVisit: (details?: VisitOutcomeDetails) => Promise<void>
  cancelVisit: () => Promise<void>
  clearAutoCheckoutNotice: () => void
  clearAutoClockOutNotice: () => void
  refresh: () => void
}

/**
 * The single source of truth for the attendance + visit state machine
 * (spec §54). Every screen that needs to know "am I clocked in / visiting"
 * reads from here rather than re-deriving it, so the valid-combination
 * rules are enforced in exactly one place.
 */
export function useJourney(): UseJourneyResult {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const settings = useAppSettings()

  const [openAttendance, setOpenAttendance] = useState<AttendanceRow | null>(null)
  const [openVisit, setOpenVisit] = useState<VisitRow | null>(null)
  const [todaysVisits, setTodaysVisits] = useState<VisitRow[]>([])
  const [todaysAttendance, setTodaysAttendance] = useState<AttendanceRow[]>([])
  const [lastAutoCheckout, setLastAutoCheckout] = useState<JourneyState['lastAutoCheckout']>(null)
  const [lastAutoClockOut, setLastAutoClockOut] = useState<JourneyState['lastAutoClockOut']>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const busyRef = useRef(false) // duplicate-tap guard independent of render timing

  const load = useCallback(async () => {
    if (!userId) {
      setOpenAttendance(null)
      setOpenVisit(null)
      setTodaysVisits([])
      setTodaysAttendance([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [attendance, visit, visits, attendanceToday] = await Promise.all([
        attendanceService.getOpenAttendance(userId),
        attendanceService.getOpenVisit(userId),
        attendanceService.getTodayVisits(userId, startOfTodayIso()),
        attendanceService.getTodayAttendance(userId, startOfTodayIso()),
      ])
      setOpenAttendance(attendance)
      setOpenVisit(visit)
      setTodaysVisits(visits)
      setTodaysAttendance(attendanceToday)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your journey.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load, nonce])

  // Active-visit monitoring: ping location on the configured interval while
  // a visit is open, and react if the server auto-checks it out.
  useEffect(() => {
    if (!openVisit || openVisit.checked_out_at) return

    const intervalMs = settings.locationPingIntervalMinutes * 60_000
    let cancelled = false

    async function ping() {
      try {
        const reading = await locationService.getCurrentPosition({ timeout: 20_000 })
        if (cancelled || !openVisit) return
        const result = await visitsService.recordLocationPing(openVisit.id, reading.latitude, reading.longitude, reading.accuracy)
        if (cancelled) return
        if (result.autoCheckedOut && result.visit) {
          haptic('warning')
          setOpenVisit(null)
          setLastAutoCheckout({ reason: 'outside_radius', visit: result.visit })
          setTodaysVisits((prev) => prev.map((v) => (v.id === result.visit!.id ? result.visit! : v)))
        }
      } catch {
        // A single failed ping (permission revoked mid-visit, brief GPS
        // dropout) isn't fatal -- the next interval tries again. Tracking
        // gaps are surfaced in reporting, not by interrupting the visit.
      }
    }

    const timer = setInterval(ping, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the open visit identity or interval changes
  }, [openVisit?.id, settings.locationPingIntervalMinutes])

  // End-of-day enforcement: while clocked in, periodically check whether
  // the device clock suggests we're past work_end_time + the admin's grace
  // period, and if so ask the server to auto clock out (it re-validates
  // against its own clock and the live settings before acting -- see
  // attendanceService.enforceWorkingHours). Only fetches a location fix
  // once the cheap client-side check trips, so this doesn't poll GPS all
  // day the way the visit ping does.
  useEffect(() => {
    if (!openAttendance || openAttendance.clock_out_at) return

    const intervalMs = settings.locationPingIntervalMinutes * 60_000
    let cancelled = false

    async function check() {
      if (!isPastTimeOfDay(settings.workEndTime, settings.autoClockoutGraceMinutes)) return
      try {
        const reading = await locationService.getCurrentPosition({ timeout: 20_000 })
        if (cancelled) return
        const result = await attendanceService.enforceWorkingHours({
          latitude: reading.latitude,
          longitude: reading.longitude,
          accuracy: reading.accuracy,
        })
        if (cancelled || !result.autoClockedOut || !result.attendance) return
        haptic('warning')
        // The session just closed itself -- there's nothing open anymore.
        // (Working hours are over, so within_clock_in_window will keep a
        // new clock-in from starting right back up anyway.)
        setOpenAttendance(null)
        setTodaysAttendance((prev) => prev.map((a) => (a.id === result.attendance!.id ? result.attendance! : a)))
        setLastAutoClockOut(result.attendance)
        if (result.autoCheckedOutVisit) {
          setOpenVisit(null)
          setLastAutoCheckout({ reason: 'clock_out', visit: result.autoCheckedOutVisit })
          setTodaysVisits((prev) => prev.map((v) => (v.id === result.autoCheckedOutVisit!.id ? result.autoCheckedOutVisit! : v)))
        }
      } catch {
        // Same tolerance as the visit ping -- a missed check just retries next interval.
      }
    }

    const timer = setInterval(check, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the open attendance identity or these settings change
  }, [openAttendance?.id, openAttendance?.clock_out_at, settings.locationPingIntervalMinutes, settings.workEndTime, settings.autoClockoutGraceMinutes])

  async function withBusyGuard(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      // Fail fast and honestly rather than let a write hang or silently
      // queue -- we never want the UI to suggest a clock-in/check-in
      // succeeded when it hasn't actually reached the server (spec §46).
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error("You're offline. Please reconnect and try again.")
      }
      await action()
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function requireLocation() {
    try {
      return await locationService.getCurrentPosition()
    } catch (e) {
      if (e instanceof LocationError) {
        throw new Error(
          e.status === 'permission_denied'
            ? 'Location access is required. Please allow location and try again.'
            : 'Location is currently unavailable. Please try again.'
        )
      }
      throw e
    }
  }

  return {
    attendance: deriveAttendanceStatus(openAttendance),
    visit: deriveVisitStatus(openVisit, lastAutoCheckout != null),
    openAttendance,
    openVisit,
    lastAutoCheckout,
    lastAutoClockOut,
    todaysVisits,
    todaysAttendance,
    loading,
    busy,
    error,

    clockIn: (selfieBlob) =>
      withBusyGuard(async () => {
        if (!userId) throw new Error('Not signed in.')
        const reading = await requireLocation()
        const attendance = await attendanceService.clockIn(
          userId,
          { latitude: reading.latitude, longitude: reading.longitude, accuracy: reading.accuracy },
          selfieBlob
        )
        setOpenAttendance(attendance)
        setTodaysAttendance((prev) => [...prev, attendance])
        haptic('success')
      }),

    clockOut: (selfieBlob) =>
      withBusyGuard(async () => {
        if (!userId) throw new Error('Not signed in.')
        const reading = await requireLocation()
        const { attendance, autoCheckedOutVisit } = await attendanceService.clockOut(
          userId,
          { latitude: reading.latitude, longitude: reading.longitude, accuracy: reading.accuracy },
          selfieBlob
        )
        // Only one attendance session can ever be open at a time, but the
        // day itself isn't "done" -- clocking in again (a lunch break, a
        // split shift) is allowed, so there's nothing left open now rather
        // than treating this closed record as still "the" attendance.
        setOpenAttendance(null)
        setTodaysAttendance((prev) => prev.map((a) => (a.id === attendance.id ? attendance : a)))
        // app.clock_out force-checks-out a still-open visit rather than
        // blocking the clock-out -- surface it the same way a
        // radius-triggered auto checkout is surfaced.
        if (autoCheckedOutVisit) {
          setOpenVisit(null)
          setLastAutoCheckout({ reason: 'clock_out', visit: autoCheckedOutVisit })
          setTodaysVisits((prev) => prev.map((v) => (v.id === autoCheckedOutVisit.id ? autoCheckedOutVisit : v)))
        }
        haptic('success')
      }),

    startVisit: (customerId) =>
      withBusyGuard(async () => {
        const reading = await requireLocation()
        const visit = await visitsService.checkIn(customerId, reading.latitude, reading.longitude, reading.accuracy)
        setOpenVisit(visit)
        setTodaysVisits((prev) => [...prev, visit])
        setLastAutoCheckout(null)
        haptic('success')
      }),

    endVisit: (details?: VisitOutcomeDetails) =>
      withBusyGuard(async () => {
        if (!openVisit) return
        const reading = await requireLocation()
        const visit = await visitsService.checkOut(openVisit.id, reading.latitude, reading.longitude, reading.accuracy, details)
        setOpenVisit(null)
        setTodaysVisits((prev) => prev.map((v) => (v.id === visit.id ? visit : v)))
        haptic('success')
      }),

    cancelVisit: () =>
      withBusyGuard(async () => {
        if (!openVisit) return
        const visit = await visitsService.cancelVisit(openVisit.id)
        setOpenVisit(null)
        // A cancelled visit never happened -- drop it from today's list rather
        // than leaving a "phantom" entry in the timeline/stats, unlike a real
        // checkout which always stays.
        setTodaysVisits((prev) => prev.filter((v) => v.id !== visit.id))
        haptic('light')
      }),

    clearAutoCheckoutNotice: () => setLastAutoCheckout(null),
    clearAutoClockOutNotice: () => setLastAutoClockOut(null),
    refresh: () => setNonce((n) => n + 1),
  }
}
