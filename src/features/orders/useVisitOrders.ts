import { useEffect, useMemo, useState } from 'react'
import { callRpc } from '@/lib/rpc'
import { ORDER_RECONCILE_DAYS } from '@/lib/config'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { isMarkedOrdered, orderState, type OrderMatch, type OrderState } from './orderReconcile'

interface VisitLike {
  id: string
  checked_in_at: string
  cancelled_at?: string | null
  customer_id?: string | null
  order_status_id?: string | null
  order_amount_usd?: number | null
}

const CHUNK = 200

/**
 * The order state of each visit (see orderReconcile): the person's "ordered" mark
 * reconciled against the synced sale orders. Until the lookup answers, a marked
 * visit reads as pending (it counts), so a slow or failed lookup never turns real
 * orders into misses.
 */
export function useVisitOrders(visits: VisitLike[]): Record<string, OrderState> {
  const { byKind } = useVisitOptions()
  const orderedId = byKind.order_status.find((o) => o.label.trim().toLowerCase() === 'ordered')?.id ?? null
  const live = useMemo(() => visits.filter((v) => !v.cancelled_at), [visits])
  // Only visits with a customer can match an order.
  const key = live.filter((v) => v.customer_id).map((v) => v.id).sort().join(',')
  const [matches, setMatches] = useState<Record<string, OrderMatch>>({})
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!key) {
      setMatches({})
      setLoadedKey('')
      return
    }
    let cancelled = false
    const ids = key.split(',')
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
    Promise.all(chunks.map((c) => callRpc<{ visit_id: string; order_no: string; order_date: string; total_usd: number | null }[]>('visit_orders', { p_visit_ids: c, p_days: ORDER_RECONCILE_DAYS })))
      .then((parts) => {
        if (cancelled) return
        const next: Record<string, OrderMatch> = {}
        for (const r of parts.flat()) next[r.visit_id] = { orderNo: r.order_no, orderDate: r.order_date, totalUsd: r.total_usd }
        setMatches(next)
        setLoadedKey(key)
      })
      .catch(() => {
        if (!cancelled) setLoadedKey(null)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return useMemo(() => {
    const now = Date.now()
    const known = loadedKey === key
    const out: Record<string, OrderState> = {}
    for (const v of live) {
      const marked = isMarkedOrdered(v, orderedId)
      // Without an answer yet, a mark stays pending: never count it as missed.
      out[v.id] = known ? orderState(v, marked, matches[v.id], now) : marked ? 'pending' : 'none'
    }
    return out
  }, [live, matches, loadedKey, key, orderedId])
}
