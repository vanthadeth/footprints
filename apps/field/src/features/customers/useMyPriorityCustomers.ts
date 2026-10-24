import { useEffect, useState } from 'react'
import { supabase } from '@footprints/shared/lib/supabase'
import { priorityPurchaseSince, type PriorityCustomer } from './priorityCoverage'

/** The person's own active customers who bought recently (see priorityCoverage). Empty until it answers or without a user. */
export function useMyPriorityCustomers(userId: string | null): PriorityCustomer[] {
  const [rows, setRows] = useState<PriorityCustomer[]>([])
  useEffect(() => {
    if (!userId) {
      setRows([])
      return
    }
    let cancelled = false
    supabase
      .from('customers')
      .select('id, shop_name, owner_id, status, last_purchase_date, last_visit_date')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .gte('last_purchase_date', priorityPurchaseSince(Date.now()))
      .limit(1000)
      .then(({ data }) => {
        if (!cancelled) setRows((data ?? []) as PriorityCustomer[])
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  return rows
}
