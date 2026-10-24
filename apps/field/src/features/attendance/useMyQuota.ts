import { useEffect, useState } from 'react'
import { quotasService, type MyQuota } from './quotasService'

/** A user's own visit quota (set by a supervisor/admin) -- no row yet just means no target configured, not an error. */
export function useMyQuota(userId: string | null): MyQuota {
  const [quota, setQuota] = useState<MyQuota>({ dailyVisitTarget: null, weeklyVisitTarget: null })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    quotasService
      .getMine(userId)
      .then((q) => {
        if (!cancelled) setQuota(q)
      })
      .catch(() => {
        // No quota configured, or the row genuinely can't be read -- either
        // way, Home just shows a plain visit count with no target/progress
        // bar rather than an error banner over something this optional.
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return quota
}
