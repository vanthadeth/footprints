import { useEffect, useState } from 'react'
import { summaryService } from './summaryService'
import type { AttendanceDay } from './attendanceSummary'

/** attendance_days rows for [from, to], limited to the given people. Refetches when the range changes. */
export function useAttendanceDays(from: string, to: string, userIds: string[]) {
  const [rows, setRows] = useState<AttendanceDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const idsKey = [...userIds].sort().join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const ids = new Set(idsKey.split(','))
    summaryService
      .days(from, to)
      .then((all) => {
        if (cancelled) return
        setRows(all.filter((r) => ids.has(r.userId)))
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load attendance.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [from, to, idsKey])

  return { rows, loading, error }
}
