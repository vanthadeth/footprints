import { useEffect, useState } from 'react'
import { useProfile } from '@/features/auth/useProfile'
import { leaveService } from '@/features/leave/leaveService'
import { tripService } from '@/features/trips/tripService'

/** How many leave requests and sales trips are waiting for the caller to decide (0 when they can't approve). A badge only -- errors just mean no number. */
export function usePendingApprovals(enabled: boolean): number {
  const { profile } = useProfile()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled || !profile) return setCount(0)
    let cancelled = false
    Promise.all([
      leaveService.listRequests().then((rows) => rows.filter((r) => r.status === 'pending' && r.user_id !== profile.id).length).catch(() => 0),
      tripService.team().then((rows) => rows.filter((t) => t.can_decide).length).catch(() => 0),
    ]).then(([leave, trips]) => !cancelled && setCount(leave + trips))
    return () => {
      cancelled = true
    }
  }, [enabled, profile])
  return count
}
