import { useEffect, useState } from 'react'
import { supabase } from '@footprints/shared/lib/supabase'

/** The columns the month's visit numbers and order lookup need. */
export interface MonthVisit {
  id: string
  user_id: string
  customer_id: string | null
  checked_in_at: string
  checked_out_at: string | null
  cancelled_at: string | null
  order_status_id: string | null
  order_amount_usd: number | null
}

const COLUMNS = 'id, user_id, customer_id, checked_in_at, checked_out_at, cancelled_at, order_status_id, order_amount_usd'
const PAGE = 1000

/**
 * The visits these people made in [startIso, endIso), not cancelled. A month of a team is more rows than one request
 * returns, so it reads page by page; until it has answered the list is empty and `loading` is true.
 */
export function useMonthVisits(userIds: string[], startIso: string, endIso: string): { visits: MonthVisit[]; loading: boolean } {
  const [state, setState] = useState<{ visits: MonthVisit[]; loading: boolean }>({ visits: [], loading: true })
  const idsKey = [...new Set(userIds)].sort().join(',')

  useEffect(() => {
    if (!idsKey) {
      setState({ visits: [], loading: false })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    ;(async () => {
      const all: MonthVisit[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('visits')
          .select(COLUMNS)
          .in('user_id', idsKey.split(','))
          .gte('checked_in_at', startIso)
          .lt('checked_in_at', endIso)
          .is('cancelled_at', null)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error || !data) return { ok: false as const }
        all.push(...(data as MonthVisit[]))
        if (data.length < PAGE) return { ok: true as const, all }
      }
    })().then((r) => {
      if (cancelled) return
      setState({ visits: r && r.ok ? r.all : [], loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [idsKey, startIso, endIso])

  return state
}
