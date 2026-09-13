import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** Batched shop_name lookup for a set of customer ids (e.g. today's visit list). */
export function useCustomerNames(customerIds: (string | null)[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const key = [...new Set(customerIds.filter((id): id is string => !!id))].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    supabase
      .from('customers')
      .select('id, shop_name')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return
        setNames((prev) => ({ ...prev, ...Object.fromEntries(data.map((c) => [c.id, c.shop_name])) }))
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return names
}
