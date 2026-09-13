import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DateRange } from '@/lib/dateRange'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

interface FleetHistoryState {
  attendance: AttendanceRow[]
  visits: VisitRow[]
  loading: boolean
  error: string | null
}

/** Attendance + visits for a set of users over a date range -- the shared data source behind the Dashboard and both Reports. */
export function useFleetHistory(userIds: string[], range: DateRange): FleetHistoryState {
  const [state, setState] = useState<FleetHistoryState>({ attendance: [], visits: [], loading: true, error: null })
  const idsKey = [...userIds].sort().join(',')

  useEffect(() => {
    if (userIds.length === 0) {
      setState({ attendance: [], visits: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([
      supabase.from('attendance').select('*').in('user_id', userIds).gte('clock_in_at', range.startIso).lt('clock_in_at', range.endIso),
      supabase.from('visits').select('*').in('user_id', userIds).gte('checked_in_at', range.startIso).lt('checked_in_at', range.endIso).is('cancelled_at', null),
    ]).then(([attendanceRes, visitsRes]) => {
      if (cancelled) return
      if (attendanceRes.error || visitsRes.error) {
        setState({ attendance: [], visits: [], loading: false, error: attendanceRes.error?.message ?? visitsRes.error?.message ?? 'Failed to load.' })
        return
      }
      setState({ attendance: attendanceRes.data ?? [], visits: visitsRes.data ?? [], loading: false, error: null })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey is the stable identity for userIds
  }, [idsKey, range.startIso, range.endIso])

  return state
}
