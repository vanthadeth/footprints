import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DateRange } from '@/lib/dateRange'
import type { AttendanceRow, VisitRow } from './types'

export interface DayJourney {
  date: string // YYYY-MM-DD, local calendar day
  attendance: AttendanceRow | null
  visits: VisitRow[]
}

interface HistoryState {
  days: DayJourney[]
  allVisits: VisitRow[]
  loading: boolean
  error: string | null
}

/** Attendance + visit history for the signed-in user over a date range, grouped by calendar day. */
export function useJourneyHistory(userId: string | null, range: DateRange): HistoryState {
  const [state, setState] = useState<HistoryState>({ days: [], allVisits: [], loading: true, error: null })

  useEffect(() => {
    if (!userId) {
      setState({ days: [], allVisits: [], loading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .gte('clock_in_at', range.startIso)
        .lt('clock_in_at', range.endIso)
        .order('clock_in_at', { ascending: true }),
      supabase
        .from('visits')
        .select('*')
        .eq('user_id', userId)
        .gte('checked_in_at', range.startIso)
        .lt('checked_in_at', range.endIso)
        .order('checked_in_at', { ascending: true }),
    ]).then(([attendanceRes, visitsRes]) => {
      if (cancelled) return
      if (attendanceRes.error || visitsRes.error) {
        setState({
          days: [],
          allVisits: [],
          loading: false,
          error: attendanceRes.error?.message ?? visitsRes.error?.message ?? 'Failed to load history.',
        })
        return
      }

      const attendanceRows = attendanceRes.data ?? []
      const visitRows = visitsRes.data ?? []
      const byDate = new Map<string, DayJourney>()

      for (const a of attendanceRows) {
        const date = a.clock_in_at.slice(0, 10)
        byDate.set(date, { date, attendance: a, visits: [] })
      }
      for (const v of visitRows) {
        const date = v.checked_in_at.slice(0, 10)
        const existing = byDate.get(date)
        if (existing) existing.visits.push(v)
        else byDate.set(date, { date, attendance: null, visits: [v] })
      }

      const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
      setState({ days, allVisits: visitRows, loading: false, error: null })
    })

    return () => {
      cancelled = true
    }
  }, [userId, range.startIso, range.endIso])

  return state
}
