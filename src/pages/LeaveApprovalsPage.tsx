import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { ApprovalsTab } from '@/features/leave/ApprovalsTab'
import { displayName } from '@/lib/displayName'
import { leaveTitle, type LeaveRequest } from '@/features/leave/types'
import { AdminTabs } from '@/components/AdminKit'
import { useTab } from '@/hooks/useTab'
import { todayDateString } from '@/lib/dateRange'
import { leaveDateRangeLabel } from '@/features/leave/leaveDate'
import { tripService, type TripRow } from '@/features/trips/tripService'
import { TripApprovalCard } from '@/features/trips/TripApprovalCard'
import { DEFAULT_RATES, dayLabel, type TripRates } from '@/features/trips/trip'

/**
 * Approvals (a tab for managers and HR, Hub for admins), as on the canvas
 * (Polish › Approvals): Leave and Trips tabs, each with what's waiting for
 * the caller first (leave and flexible days off from the people they can
 * decide for, RLS-scoped and never their own; sales trips for a Sales
 * Manager / Super Admin), then what was decided in the last 30 days.
 */
export function LeaveApprovalsPage() {
  const { profile } = useProfile()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useTab(['leave', 'trips'] as const, 'leave')
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
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const decidedTrips = useMemo(
    () => trips.filter((t) => (t.status === 'approved' || t.status === 'rejected' || t.status === 'changes') && t.decided_at && t.decided_at >= monthAgo).sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '')),
    [trips, monthAgo]
  )
  const decidedLeave = decided.filter((r) => (r.decided_at ?? '') >= monthAgo)
  const isTrips = tab === 'trips'
  const waitingCount = isTrips ? waitingTrips.length : pending.length
  const firstStart = isTrips ? waitingTrips[0]?.start_date : [...pending].sort((a, b) => a.start_date.localeCompare(b.start_date))[0]?.start_date
  const days = firstStart ? Math.round((Date.parse(`${firstStart}T00:00:00Z`) - Date.parse(`${todayDateString()}T00:00:00Z`)) / 86_400_000) : null
  const lead = waitingCount
    ? `${waitingCount} waiting for you${days != null ? ` · ${days <= 0 ? 'starts today' : days === 1 ? 'starts tomorrow' : `next starts in ${days} days`}` : ''}`
    : `All caught up on ${isTrips ? 'trips' : 'leave'}`
  const ini = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const pill = (status: string) =>
    status === 'approved' ? 'bg-status-working/10 text-status-working' : status === 'changes' ? 'bg-status-warn/10 text-status-warn' : 'bg-status-danger/10 text-status-danger'
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')

  return (
    <div className="mx-auto max-w-lg space-y-3.5 px-4 pb-6 pt-3 md:max-w-3xl md:px-8">
      <AdminTabs
        tabs={[
          ['leave', `Leave · ${pending.length}`],
          ['trips', `Trips · ${waitingTrips.length}`],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[13px] text-neutral-600">{lead}</p>
        <Link to="/calendar" className="text-[13px] font-bold text-brand-500">
          Calendar
        </Link>
      </div>
      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      ) : (
        <>
          <p className="px-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Waiting · {waitingCount}</p>
          {isTrips ? (
            waitingTrips.length === 0 ? (
              <p className="rounded-2xl border border-neutral-100 bg-white p-5 text-center text-[13.5px] text-neutral-500 shadow-card">No trip requests waiting.</p>
            ) : (
              <div className="space-y-3">
                {waitingTrips.map((t) => (
                  <TripApprovalCard key={t.id} trip={t} rates={rates} onDecided={load} />
                ))}
              </div>
            )
          ) : pending.length === 0 ? (
            <p className="rounded-2xl border border-neutral-100 bg-white p-5 text-center text-[13.5px] text-neutral-500 shadow-card">No leave requests waiting.</p>
          ) : (
            <ApprovalsTab requests={pending} nameById={nameById} onChanged={load} />
          )}

          <p className="px-0.5 pt-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Decided · last 30 days</p>
          <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            {(isTrips ? decidedTrips.length : decidedLeave.length) === 0 && <p className="p-4 text-center text-[13px] text-neutral-500">Nothing decided in the last 30 days.</p>}
            {isTrips
              ? decidedTrips.map((t, i) => (
                  <Link key={t.id} to={`/trips/${t.id}`} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{ini(t.requester)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-neutral-900">{t.requester}</span>
                      <span className="block truncate text-[12px] text-neutral-500">
                        Sales trip · {dayLabel(t.start_date)} – {dayLabel(t.end_date)} · decided {when(t.decided_at)}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${pill(t.status)}`}>{t.status === 'approved' ? 'Approved' : t.status === 'changes' ? 'Changes asked' : 'Declined'}</span>
                  </Link>
                ))
              : decidedLeave.map((r, i) => (
                  <div key={r.id} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{ini(nameById[r.user_id] ?? '?')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-neutral-900">{nameById[r.user_id] ?? 'Someone'}</span>
                      <span className="block truncate text-[12px] text-neutral-500">
                        {leaveTitle(r.leave_type)} · {leaveDateRangeLabel(r.start_date, r.end_date, r.start_period, r.end_period)} · decided {when(r.decided_at)}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${pill(r.status)}`}>{r.status === 'approved' ? 'Approved' : 'Declined'}</span>
                  </div>
                ))}
          </div>
        </>
      )}
    </div>
  )
}
