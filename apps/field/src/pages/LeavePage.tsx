import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { usersService, type ManagedUser } from '@footprints/shared/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { MyLeaveTab } from '@/features/leave/MyLeaveTab'
import { BalanceTab } from '@/features/leave/BalanceTab'
import { AttendanceCalendar } from '@/features/leave/AttendanceCalendar'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { displayName } from '@footprints/shared/lib/displayName'
import type { LeaveBalanceSummary, LeaveRequest } from '@/features/leave/types'

type Tab = 'leave' | 'balance' | 'attendance'
const TABS: Tab[] = ['leave', 'balance', 'attendance']

/**
 * The Leave tab (bottom bar): the signed-in user's own leave -- requests,
 * balances, and a month calendar of their attendance. Approving other
 * people's requests lives at /approvals (a tab for managers and HR), scoped by the
 * same app.can('leave', ...) RLS as before.
 */
export function LeavePage() {
  const { t } = useLanguage()
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
      .catch((e) => setError(e instanceof Error ? e.message : t('leave.loadFailed')))
      .finally(() => setLoading(false))
  }, [year, t])

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
    <div className="mx-auto max-w-lg pb-6 md:max-w-3xl lg:max-w-6xl">
      <div className="space-y-4 px-4 pt-1 md:px-8 md:pt-4 lg:pt-6">
        <SegmentedControl
          ariaLabel={t('leave.tabsAria')}
          value={tab}
          onChange={(v) => setParams(v === 'leave' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'leave', label: t('leave.tabLeave') },
            { value: 'balance', label: t('leave.tabBalance') },
            { value: 'attendance', label: t('leave.tabAttendance') },
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
            {tab === 'balance' && profile && <BalanceTab userId={profile.id} requests={myRequests} canManage={canManageBalances} year={year} />}
            {tab === 'attendance' && profile && <AttendanceCalendar userId={profile.id} requests={myRequests} />}
          </>
        )}
      </div>
    </div>
  )
}
