import { useEffect, useMemo, useState } from 'react'
import { callRpc } from '@footprints/shared/lib/rpc'
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
const SHARE_MS = 30_000

/** The lookup for one set of visits, shared for a few seconds so a screen that asks twice (states, then totals) makes one request. */
const lookups = new Map<string, { at: number; promise: Promise<Record<string, OrderMatch>> }>()

function lookupMatches(key: string): Promise<Record<string, OrderMatch>> {
  const hit = lookups.get(key)
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.promise
  const ids = key.split(',')
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
  const promise = Promise.all(chunks.map((c) => callRpc<{ visit_id: string; order_no: string; order_date: string; total_usd: number | null }[]>('visit_orders', { p_visit_ids: c, p_days: ORDER_RECONCILE_DAYS }))).then((parts) => {
    const next: Record<string, OrderMatch> = {}
    for (const r of parts.flat()) next[r.visit_id] = { orderNo: r.order_no, orderDate: r.order_date, totalUsd: r.total_usd }
    return next
  })
  lookups.set(key, { at: Date.now(), promise })
  promise.catch(() => lookups.delete(key))
  return promise
}

/** The synced sale order matched to each visit (public.visit_orders), once the lookup has answered. */
function useOrderMatches(visits: VisitLike[]): { live: VisitLike[]; key: string; matches: Record<string, OrderMatch>; known: boolean } {
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
    lookupMatches(key)
      .then((next) => {
        if (cancelled) return
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

  return { live, key, matches, known: loadedKey === key }
}

/**
 * The order state of each visit (see orderReconcile): the person's "ordered" mark
 * reconciled against the synced sale orders. Until the lookup answers, a marked
 * visit reads as pending (it counts), so a slow or failed lookup never turns real
 * orders into misses.
 */
export function useVisitOrders(visits: VisitLike[]): Record<string, OrderState> {
  const { byKind } = useVisitOptions()
  const orderedId = byKind.order_status.find((o) => o.label.trim().toLowerCase() === 'ordered')?.id ?? null
  const { live, matches, known } = useOrderMatches(visits)

  return useMemo(() => {
    const now = Date.now()
    const out: Record<string, OrderState> = {}
    for (const v of live) {
      const marked = isMarkedOrdered(v, orderedId)
      // Without an answer yet, a mark stays pending: never count it as missed.
      out[v.id] = known ? orderState(v, marked, matches[v.id], now) : marked ? 'pending' : 'none'
    }
    return out
  }, [live, matches, known, orderedId])
}

/**
 * The synced sale order matched to each visit, with its order number and total, for scoring the
 * value of the day's orders. Empty until the lookup answers (the score then uses the amounts the
 * person entered).
 */
export function useVisitOrderTotals(visits: VisitLike[]): Record<string, { orderNo: string; totalUsd: number | null }> {
  const { matches, known } = useOrderMatches(visits)
  return useMemo(() => {
    const out: Record<string, { orderNo: string; totalUsd: number | null }> = {}
    if (known) for (const [id, m] of Object.entries(matches)) out[id] = { orderNo: m.orderNo, totalUsd: m.totalUsd }
    return out
  }, [matches, known])
}
