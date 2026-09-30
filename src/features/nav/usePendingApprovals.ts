import { useEffect, useState } from 'react'
import { useProfile } from '@/features/auth/useProfile'
import { leaveService } from '@/features/leave/leaveService'

/** How many leave requests are waiting for the caller to decide (0 when they can't approve). A badge only -- errors just mean no number. */
export function usePendingApprovals(enabled: boolean): number {
  const { profile } = useProfile()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled || !profile) return setCount(0)
    let cancelled = false
    leaveService
      .listRequests()
      .then((rows) => !cancelled && setCount(rows.filter((r) => r.status === 'pending' && r.user_id !== profile.id).length))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled, profile])
  return count
}
