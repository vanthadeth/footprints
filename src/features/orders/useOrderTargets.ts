import { useEffect, useState } from 'react'
import { callRpc } from '@/lib/rpc'

/**
 * Each person's own daily order target in USD (null: they use the company default) for everyone the
 * caller can see (public.team_order_targets). Empty until it answers; scoring then uses the company default.
 */
export function useOrderTargets(): Record<string, number | null> {
  const [targets, setTargets] = useState<Record<string, number | null>>({})
  useEffect(() => {
    let cancelled = false
    callRpc<{ user_id: string; daily_order_target_usd: number | null }[]>('team_order_targets')
      .then((rows) => {
        if (cancelled) return
        const next: Record<string, number | null> = {}
        for (const r of rows ?? []) next[r.user_id] = r.daily_order_target_usd == null ? null : Number(r.daily_order_target_usd)
        setTargets(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return targets
}
