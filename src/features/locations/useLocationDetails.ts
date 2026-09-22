import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface LocationDetail {
  name: string
  latitude: number
  longitude: number
  radiusM: number
}

/**
 * Batched lookup for a set of work_location ids, same shape as
 * useLocationNames.ts but carrying coordinates/radius too -- for the Clock
 * In/Out detail sheet's map + distance display, which needs more than just
 * the name. A separate hook rather than widening useLocationNames itself,
 * so its 3 existing name-only callers (JourneyMap, JourneyTimeline,
 * CheckInPage) are unaffected.
 */
export function useLocationDetails(locationIds: (string | null)[]): Record<string, LocationDetail> {
  const [details, setDetails] = useState<Record<string, LocationDetail>>({})
  const key = [...new Set(locationIds.filter((id): id is string => !!id))].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    supabase
      .from('work_locations')
      .select('id, name, latitude, longitude, radius_m')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return
        setDetails((prev) => ({
          ...prev,
          ...Object.fromEntries(
            data.map((l) => [l.id, { name: l.name, latitude: l.latitude, longitude: l.longitude, radiusM: l.radius_m }])
          ),
        }))
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return details
}
