import { useCallback, useRef, useState } from 'react'
import { summaryService } from './summaryService'
import type { AttendanceDay } from './attendanceSummary'

/**
 * attendance_days for whichever range the roster is showing (at most 62 days, so one month or week at a time).
 * Pass `loadRange` to the roster's onRangeChange. A range already loaded is shown again at once; the previous rows stay on screen while a new range loads.
 */
export function useRosterAttendance() {
  const [state, setState] = useState<{ rows: AttendanceDay[]; loading: boolean; error: string | null }>({ rows: [], loading: true, error: null })
  const cache = useRef(new Map<string, AttendanceDay[]>())
  /** Loads already under way, so asking for the same range twice (a quick re-render, two clicks) makes one request. */
  const inflight = useRef(new Map<string, Promise<AttendanceDay[]>>())
  const latest = useRef('')

  const loadRange = useCallback((from: string, to: string) => {
    const key = `${from}|${to}`
    latest.current = key
    const hit = cache.current.get(key)
    if (hit) {
      setState({ rows: hit, loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    const request = inflight.current.get(key) ?? summaryService.days(from, to)
    inflight.current.set(key, request)
    request
      .then((rows) => {
        cache.current.set(key, rows)
        if (latest.current === key) setState({ rows, loading: false, error: null })
      })
      .catch((e) => {
        if (latest.current === key) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Could not load attendance.' }))
      })
      .finally(() => inflight.current.delete(key))
  }, [])

  return { ...state, loadRange }
}
