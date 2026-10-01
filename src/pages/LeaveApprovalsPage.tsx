import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { ApprovalsTab } from '@/features/leave/ApprovalsTab'
import { displayName } from '@/lib/displayName'
import { leaveTitle, type LeaveRequest } from '@/features/leave/types'
import { SegmentedControl } from '@/components/SegmentedControl'
import { leaveDateRangeLabel } from '@/features/leave/leaveDate'
import { tripService, type TripRow } from '@/features/trips/tripService'
import { TripApprovalCard } from '@/features/trips/TripApprovalCard'
import { DEFAULT_RATES, dayLabel, type TripRates } from '@/features/trips/trip'

/**
 * Approvals (a tab for managers and HR, Hub for admins): pending leave and
 * flexible day off requests from the people the caller can decide for
 * (RLS-scoped, never their own), each with its balance, and sales trips
 * waiting for them (Sales Manager / Super Admin); Decided lists the recent
 * answers.
 */
export function LeaveApprovalsPage() {
  const { profile } = useProfile()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'waiting' | 'decided'>('waiting')
  const [trips, setTrips] = useState<TripRow[]>([])
  const [rates, setRates] = useState<TripRates>(DEFAULT_RATES)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([leaveService.listRequests(), usersService.list().catch(() => [] as ManagedUser[]), tripService.team().catch(() => [] as TripRow[]), tripService.rates().catch(() => DEFAULT_RATES)])
      .then(([r, p, t, tr]) => {
        setRequests(r)
        setPeople(p)
        setTrips(t)
        setRates(tr)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leave requests.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, displayName(p.fullName, p.nickname)])), [people])
  const pending = useMemo(() => requests.filter((r) => r.status === 'pending' && r.user_id !== profile?.id), [requests, profile?.id])
  const decided = useMemo(
    () =>
      requests
        .filter((r) => (r.status === 'approved' || r.status === 'rejected') && r.user_id !== profile?.id && r.decided_at)
        .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))
        .slice(0, 30),
    [requests, profile?.id]
  )

  const waitingTrips = useMemo(() => trips.filter((t) => t.can_decide).sort((a, b) => a.start_date.localeCompare(b.start_date)), [trips])
  const decidedTrips = useMemo(() => trips.filter((t) => (t.status === 'approved' || t.status === 'rejected' || t.status === 'changes') && t.decided_at).sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '')).slice(0, 20), [trips])

  return (
    <div className="mx-auto max-w-lg px-4 pb-6 pt-4 md:max-w-3xl md:px-8">
      <SegmentedControl
        ariaLabel="Approvals"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'waiting', label: `Waiting · ${pending.length + waitingTrips.length}` },
          { value: 'decided', label: 'Decided' },
        ]}
      />
      <div className="h-3" />
      {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}
      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      ) : (
        tab === 'waiting' ? (
          <div className="space-y-3">
            {waitingTrips.map((t) => (
              <TripApprovalCard key={t.id} trip={t} rates={rates} onDecided={load} />
            ))}
            {(pending.length > 0 || waitingTrips.length === 0) && <ApprovalsTab requests={pending} nameById={nameById} onChanged={load} />}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            {decided.length === 0 && decidedTrips.length === 0 && <p className="p-5 text-center text-[13.5px] text-neutral-500">No decisions yet.</p>}
            {decidedTrips.map((t, i) => (
              <Link key={t.id} to={`/trips/${t.id}`} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-neutral-900">{t.requester}</span>
                  <span className="block truncate text-[12px] text-neutral-500">
                    Sales trip · {dayLabel(t.start_date)} – {dayLabel(t.end_date)} · {t.people_count} {t.people_count === 1 ? 'person' : 'people'}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${t.status === 'approved' ? 'bg-status-working/10 text-status-working dark:text-emerald-300' : t.status === 'changes' ? 'bg-status-warn/10 text-status-warn' : 'bg-status-danger/10 text-status-danger'}`}>
                  {t.status === 'approved' ? 'Approved' : t.status === 'changes' ? 'Changes asked' : 'Rejected'}
                </span>
              </Link>
            ))}
            {decided.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-neutral-900">{nameById[r.user_id] ?? 'Someone'}</span>
                  <span className="block truncate text-[12px] text-neutral-500">
                    {leaveTitle(r.leave_type)} · {leaveDateRangeLabel(r.start_date, r.end_date, r.start_period, r.end_period)}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${r.status === 'approved' ? 'bg-status-working/10 text-status-working dark:text-emerald-300' : 'bg-status-danger/10 text-status-danger'}`}>
                  {r.status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
