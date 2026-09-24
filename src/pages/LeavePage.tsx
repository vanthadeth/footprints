import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProfile } from '@/features/auth/useProfile'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { MyLeaveTab } from '@/features/leave/MyLeaveTab'
import { ApprovalsTab } from '@/features/leave/ApprovalsTab'
import { LeaveBalancesAdmin } from '@/features/leave/LeaveBalancesAdmin'
import { displayName } from '@/lib/displayName'
import type { LeaveBalanceSummary, LeaveRequest } from '@/features/leave/types'

type Tab = 'mine' | 'approvals' | 'balances'

/**
 * Leave request/approval, reachable from the Menu (spec): every employee
 * can request Annual/Sick/Unpaid leave and see their own history here;
 * anyone with a subordinate (or HR/Super Admin) also sees an Approvals
 * tab, scoped automatically by the same app.can('leave', ...) RLS every
 * other feature in this app already relies on -- no client-side role
 * branching decides who sees whose requests, only who sees the *tab*.
 */
export function LeavePage() {
  const { profile } = useProfile()
  const [tab, setTab] = useState<Tab>('mine')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalanceSummary[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const canManageBalances = profile?.is_super_admin === true || profile?.role_name === 'HR'

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([leaveService.listRequests(), leaveService.listBalances(year), usersService.list()])
      .then(([r, b, p]) => {
        setRequests(r)
        setBalances(b)
        setPeople(p)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leave data.'))
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, displayName(p.fullName, p.nickname)])), [people])
  const myRequests = useMemo(() => requests.filter((r) => r.user_id === profile?.id), [requests, profile?.id])
  const myBalances = useMemo(() => balances.filter((b) => b.user_id === profile?.id), [balances, profile?.id])
  const pendingApprovals = useMemo(
    () => requests.filter((r) => r.status === 'pending' && r.user_id !== profile?.id),
    [requests, profile?.id]
  )

  const TABS: { key: Tab; label: string }[] = [
    { key: 'mine', label: 'My Leave' },
    { key: 'approvals', label: 'Approvals' },
    ...(canManageBalances ? [{ key: 'balances' as const, label: 'Balances' }] : []),
  ]

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="mb-4 flex gap-1 rounded-full bg-neutral-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold tap-target ${
                tab === t.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : (
          <>
            {tab === 'mine' && <MyLeaveTab requests={myRequests} balances={myBalances} onChanged={load} />}
            {tab === 'approvals' && <ApprovalsTab requests={pendingApprovals} nameById={nameById} onChanged={load} />}
            {tab === 'balances' && canManageBalances && (
              <LeaveBalancesAdmin
                people={people.map((p) => ({ id: p.id, name: displayName(p.fullName, p.nickname) }))}
                balances={balances}
                year={year}
                onChanged={load}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
