import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DateRange } from '@/lib/dateRange'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'

interface TeamDayJourneysState {
  journeysByUserId: Record<string, DayJourney>
  loading: boolean
  error: string | null
}

/**
 * Attendance + visits for a set of users on a single day (the Check In/Out
 * report) -- same query shape as useJourneyHistory, but batched with
 * `.in('user_id', ids)` across the whole team and bucketed by user instead
 * of by date, since the range is already scoped to one day.
 */
export function useTeamDayJourneys(userIds: string[], range: DateRange, date: string): TeamDayJourneysState {
  const [state, setState] = useState<TeamDayJourneysState>({ journeysByUserId: {}, loading: true, error: null })
  const idsKey = [...new Set(userIds)].sort().join(',')

  useEffect(() => {
    if (!idsKey) {
      setState({ journeysByUserId: {}, loading: false, error: null })
      return
    }

    const ids = idsKey.split(',')
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .in('user_id', ids)
        .gte('clock_in_at', range.startIso)
        .lt('clock_in_at', range.endIso)
        .order('clock_in_at', { ascending: true }),
      supabase
        .from('visits')
        .select('*')
        .in('user_id', ids)
        .gte('checked_in_at', range.startIso)
        .lt('checked_in_at', range.endIso)
        .order('checked_in_at', { ascending: true }),
    ]).then(([attendanceRes, visitsRes]) => {
      if (cancelled) return
      if (attendanceRes.error || visitsRes.error) {
        setState({
          journeysByUserId: {},
          loading: false,
          error: attendanceRes.error?.message ?? visitsRes.error?.message ?? 'Failed to load history.',
        })
        return
      }

      const byUser = new Map<string, DayJourney>()
      for (const a of attendanceRes.data ?? []) {
        const existing = byUser.get(a.user_id)
        if (existing) existing.attendance.push(a)
        else byUser.set(a.user_id, { date, attendance: [a], visits: [] })
      }
      for (const v of visitsRes.data ?? []) {
        const existing = byUser.get(v.user_id)
        if (existing) existing.visits.push(v)
        else byUser.set(v.user_id, { date, attendance: [], visits: [v] })
      }

      setState({ journeysByUserId: Object.fromEntries(byUser), loading: false, error: null })
    })

    return () => {
      cancelled = true
    }
  }, [idsKey, range.startIso, range.endIso, date])

  return state
}
