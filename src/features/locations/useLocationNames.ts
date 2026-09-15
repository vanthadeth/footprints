import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** Batched name lookup for a set of work_location ids (e.g. clock_in_location_id/clock_out_location_id) -- same shape as useCustomerNames.ts. */
export function useLocationNames(locationIds: (string | null)[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const key = [...new Set(locationIds.filter((id): id is string => !!id))].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    supabase
      .from('work_locations')
      .select('id, name')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return
        setNames((prev) => ({ ...prev, ...Object.fromEntries(data.map((l) => [l.id, l.name])) }))
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return names
}
