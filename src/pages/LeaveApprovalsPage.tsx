import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProfile } from '@/features/auth/useProfile'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { ApprovalsTab } from '@/features/leave/ApprovalsTab'
import { displayName } from '@/lib/displayName'
import type { LeaveRequest } from '@/features/leave/types'

/** Hub › Team › Leave Approvals: pending requests from the people the caller can decide for (RLS-scoped, never their own). */
export function LeaveApprovalsPage() {
  const { profile } = useProfile()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([leaveService.listRequests(), usersService.list().catch(() => [] as ManagedUser[])])
      .then(([r, p]) => {
        setRequests(r)
        setPeople(p)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leave requests.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, displayName(p.fullName, p.nickname)])), [people])
  const pending = useMemo(() => requests.filter((r) => r.status === 'pending' && r.user_id !== profile?.id), [requests, profile?.id])

  return (
    <div className="mx-auto max-w-lg px-4 pb-6 pt-4 md:max-w-3xl md:px-8">
      {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}
      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      ) : (
        <ApprovalsTab requests={pending} nameById={nameById} onChanged={load} />
      )}
    </div>
  )
}
