import { useEffect, useState } from 'react'
import { supabase } from '@footprints/shared/lib/supabase'

/**
 * How many customers these people added since `fromIso` (the start of today): the manager Team screen's "New" number.
 * Zero until it answers or if it can't be read; row-level security limits it to customers the viewer may see.
 */
export function useNewCustomersToday(userIds: string[], fromIso: string): number {
  const [count, setCount] = useState(0)
  const idsKey = [...new Set(userIds)].sort().join(',')

  useEffect(() => {
    if (!idsKey) {
      setCount(0)
      return
    }
    let cancelled = false
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .in('created_by', idsKey.split(','))
      .gte('created_at', fromIso)
      .then(({ count: n }) => {
        if (!cancelled) setCount(n ?? 0)
      })
    return () => {
      cancelled = true
    }
  }, [idsKey, fromIso])

  return count
}
