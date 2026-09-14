import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { startOfTodayIso } from '@/lib/datetime'
import type { VisitRow } from '@/features/attendance/types'

interface UpcomingVisitsState {
  visits: VisitRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * A visit's `next_appointment` (captured in the outcome form at checkout --
 * "come back on this date") is the closest thing this app has to a planned
 * future stop, since there's no assigned daily route/schedule. This is
 * every one of the caller's own still-open promises, earliest first.
 */
export function useUpcomingVisits(userId: string | null): UpcomingVisitsState {
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!userId) {
      setVisits([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('*')
        .eq('user_id', userId)
        .is('cancelled_at', null)
        .gte('next_appointment', startOfTodayIso())
        .order('next_appointment', { ascending: true })
      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        setVisits(data ?? [])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, nonce])

  return { visits, loading, error, refresh: () => setNonce((n) => n + 1) }
}
