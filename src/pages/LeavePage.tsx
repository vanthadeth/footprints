import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { MyLeaveTab } from '@/features/leave/MyLeaveTab'
import { BalanceCards } from '@/features/leave/BalanceCards'
import { AttendanceCalendar } from '@/features/leave/AttendanceCalendar'
import { LeaveBalancesAdmin } from '@/features/leave/LeaveBalancesAdmin'
import { SegmentedControl } from '@/components/SegmentedControl'
import { displayName } from '@/lib/displayName'
import type { LeaveBalanceSummary, LeaveRequest } from '@/features/leave/types'

type Tab = 'leave' | 'balance' | 'attendance'
const TABS: Tab[] = ['leave', 'balance', 'attendance']

/**
 * The Leave tab (bottom bar): the signed-in user's own leave -- requests,
 * balances, and a month calendar of their attendance. Approving other
 * people's requests lives at /leave/approvals (Hub › Team), scoped by the
 * same app.can('leave', ...) RLS as before.
 */
export function LeavePage() {
  const { profile } = useProfile()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'leave'
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
    Promise.all([leaveService.listRequests(), leaveService.listBalances(year), usersService.list().catch(() => [] as ManagedUser[])])
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

  const myRequests = useMemo(() => requests.filter((r) => r.user_id === profile?.id), [requests, profile?.id])
  const myBalances = useMemo(() => balances.filter((b) => b.user_id === profile?.id), [balances, profile?.id])
  const approverName = useMemo(() => {
    const managerId = profile?.manager_id
    const manager = managerId ? people.find((p) => p.id === managerId) : undefined
    return manager ? displayName(manager.fullName, manager.nickname) : null
  }, [people, profile?.manager_id])

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl">
      <div className="space-y-4 px-4 pt-1 md:px-8 md:pt-4">
        <SegmentedControl
          ariaLabel="Leave sections"
          value={tab}
          onChange={(v) => setParams(v === 'leave' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'leave', label: 'Leave' },
            { value: 'balance', label: 'Balance' },
            { value: 'attendance', label: 'Attendance' },
          ]}
        />

        {error && <p className="text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : (
          <>
            {tab === 'leave' && <MyLeaveTab requests={myRequests} balances={myBalances} approverName={approverName} onChanged={load} />}
            {tab === 'balance' && (
              <div className="space-y-5">
                <section className="space-y-2">
                  <h2 className="px-0.5 text-[17px] font-bold text-neutral-900">My allowance · {year}</h2>
                  <BalanceCards balances={myBalances} requests={myRequests} layout="stack" />
                </section>
                {canManageBalances && (
                  <section className="space-y-2">
                    <h2 className="px-0.5 text-[17px] font-bold text-neutral-900">Team balances</h2>
                    <LeaveBalancesAdmin
                      people={people.map((p) => ({ id: p.id, name: displayName(p.fullName, p.nickname) }))}
                      balances={balances}
                      year={year}
                      onChanged={load}
                    />
                  </section>
                )}
              </div>
            )}
            {tab === 'attendance' && profile && <AttendanceCalendar userId={profile.id} requests={myRequests} />}
          </>
        )}
      </div>
    </div>
  )
}
