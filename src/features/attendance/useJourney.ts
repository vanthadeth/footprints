import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { attendanceService } from './attendanceService'
import { visitsService } from '@/features/visits/visitsService'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { useAppSettings } from '@/hooks/useAppSettings'
import { startOfTodayIso } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'
import { deriveAttendanceStatus, deriveVisitStatus } from './stateMachine'
import type { AttendanceRow, JourneyState, VisitRow } from './types'

interface UseJourneyResult extends JourneyState {
  todaysVisits: VisitRow[]
  loading: boolean
  /** True while any write (clock in/out, check in/out) is in flight -- used to disable buttons and block duplicate taps. */
  busy: boolean
  error: string | null
  clockIn: (selfieBlob: Blob) => Promise<void>
  clockOut: (selfieBlob: Blob) => Promise<void>
  startVisit: (customerId: string | null) => Promise<void>
  endVisit: () => Promise<void>
  clearAutoCheckoutNotice: () => void
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
  const [lastAutoCheckout, setLastAutoCheckout] = useState<JourneyState['lastAutoCheckout']>(null)
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
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [attendance, visit, visits] = await Promise.all([
        attendanceService.getOpenAttendance(userId),
        attendanceService.getOpenVisit(userId),
        attendanceService.getTodayVisits(userId, startOfTodayIso()),
      ])
      setOpenAttendance(attendance)
      setOpenVisit(visit)
      setTodaysVisits(visits)
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
    todaysVisits,
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
        setOpenAttendance(attendance)
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

    endVisit: () =>
      withBusyGuard(async () => {
        if (!openVisit) return
        const reading = await requireLocation()
        const visit = await visitsService.checkOut(openVisit.id, reading.latitude, reading.longitude, reading.accuracy)
        setOpenVisit(null)
        setTodaysVisits((prev) => prev.map((v) => (v.id === visit.id ? visit : v)))
        haptic('success')
      }),

    clearAutoCheckoutNotice: () => setLastAutoCheckout(null),
    refresh: () => setNonce((n) => n + 1),
  }
}
