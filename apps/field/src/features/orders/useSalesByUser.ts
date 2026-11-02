import { useEffect, useState } from 'react'
import { callRpc } from '@footprints/shared/lib/rpc'

/** One salesperson's sale orders in a period: how many, and their total in USD. */
export interface UserSales {
  orders: number
  totalUsd: number
}

/**
 * The valid sale orders assigned to each of these people with an order date from `from` to `to` ("YYYY-MM-DD", the
 * sheet's order date), from public.sales_by_user (0125). People with no orders are missing from the result. Null while
 * it loads and when the function is not there yet (an older database): callers then keep their visit-based numbers.
 */
export function useSalesByUser(userIds: string[], from: string, to: string): Record<string, UserSales> | null {
  const idsKey = [...new Set(userIds)].sort().join(',')
  const [state, setState] = useState<{ key: string; sales: Record<string, UserSales> | null }>({ key: '', sales: null })
  const key = `${idsKey}|${from}|${to}`

  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    callRpc<{ user_id: string; orders: number; total_usd: number | string | null }[]>('sales_by_user', { p_from: from, p_to: to, p_users: idsKey.split(',') })
      .then((rows) => {
        if (cancelled) return
        const sales: Record<string, UserSales> = {}
        for (const r of rows ?? []) sales[r.user_id] = { orders: Number(r.orders), totalUsd: Number(r.total_usd ?? 0) }
        setState({ key, sales })
      })
      .catch(() => !cancelled && setState({ key, sales: null }))
    return () => {
      cancelled = true
    }
  }, [idsKey, from, to, key])

  return state.key === key ? state.sales : null
}

/** The sum of the listed people's totals. */
export const sumSales = (sales: Record<string, UserSales>, ids: Iterable<string>): number => {
  let n = 0
  for (const id of ids) n += sales[id]?.totalUsd ?? 0
  return n
}
