import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { usePermissions } from '@footprints/shared/features/permissions/PermissionsContext'
import { usersService, type ManagedUser } from '@footprints/shared/features/users/usersService'
import { leaveService } from '@/features/leave/leaveService'
import { ApprovalsTab } from '@/features/leave/ApprovalsTab'
import { displayName } from '@footprints/shared/lib/displayName'
import type { LeaveRequest } from '@/features/leave/types'
import { leaveTitleOf } from '@/features/leave/leaveText'
import { dayMonth } from '@/features/customers/detail/dates'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { AdminTabs } from '@footprints/shared/components/AdminKit'
import { useTab } from '@/hooks/useTab'
import { todayDateString } from '@/lib/dateRange'
import { leaveDateRangeLabel } from '@/features/leave/leaveDate'
import { tripService, type TripRow } from '@/features/trips/tripService'
import { TripApprovalCard } from '@/features/trips/TripApprovalCard'
import { TripTransfersPanel } from '@/features/trips/TripTransfersPanel'
import { DEFAULT_RATES, dayLabel, type TripRates } from '@/features/trips/trip'

/**
 * Approvals (a tab for managers and HR, Hub for admins), as on the canvas
 * (Polish › Approvals): Leave and Trips tabs, each with what's waiting for
 * the caller first (leave and flexible days off from the people they can
 * decide for, RLS-scoped and never their own; sales trips for a Sales
 * Manager / Super Admin), then what was decided in the last 30 days.
 */
export function LeaveApprovalsPage() {
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const { ready, can } = usePermissions()
  const canTransfer = ready && can('sales_trip_transfer', 'edit')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useTab(['leave', 'trips', 'transfers'] as const, 'leave')
  const [trips, setTrips] = useState<TripRow[]>([])
  const [ledger, setLedger] = useState<TripRow[]>([])
  const [rates, setRates] = useState<TripRates>(DEFAULT_RATES)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([leaveService.listRequests(), usersService.list().catch(() => [] as ManagedUser[]), tripService.team().catch(() => [] as TripRow[]), tripService.rates().catch(() => DEFAULT_RATES), canTransfer ? tripService.ledger() : Promise.resolve([] as TripRow[])])
      .then(([r, p, t, tr, l]) => {
        setRequests(r)
        setPeople(p)
        setTrips(t)
        setRates(tr)
        setLedger(l)
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('leave.loadRequestsFailed')))
      .finally(() => setLoading(false))
  }, [canTransfer, t])

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
  const isTransfers = tab === 'transfers' && canTransfer
  const toTransfer = ledger.filter((t) => t.can_transfer).length
  const waitingCount = isTransfers ? toTransfer : isTrips ? waitingTrips.length : pending.length
  const firstStart = isTrips ? waitingTrips[0]?.start_date : [...pending].sort((a, b) => a.start_date.localeCompare(b.start_date))[0]?.start_date
  const days = firstStart ? Math.round((Date.parse(`${firstStart}T00:00:00Z`) - Date.parse(`${todayDateString()}T00:00:00Z`)) / 86_400_000) : null
  const lead = isTransfers
    ? toTransfer
      ? t(toTransfer === 1 ? 'leave.leadTransferOne' : 'leave.leadTransferMany', { n: toTransfer })
      : t('leave.caughtTransfers')
    : waitingCount
    ? `${t('leave.waitingForYou', { n: waitingCount })}${days != null ? ` · ${days <= 0 ? t('leave.startsToday') : days === 1 ? t('leave.startsTomorrow') : t('leave.nextStarts', { n: days })}` : ''}`
    : t(isTrips ? 'leave.caughtTrips' : 'leave.caughtLeave')
  const ini = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const pill = (status: string) =>
    status === 'approved' ? 'bg-status-working/10 text-status-working' : status === 'changes' ? 'bg-status-warn/10 text-status-warn' : 'bg-status-danger/10 text-status-danger'
  const when = (iso: string | null) => (iso ? dayMonth(iso, language) : '')

  return (
    <div className="mx-auto max-w-lg space-y-3.5 px-4 pb-6 pt-3 md:max-w-3xl md:px-8 lg:max-w-[1440px] lg:pt-6">
      <div className="lg:max-w-md">
      <AdminTabs
        tabs={[
          ['leave', t('leave.apTabLeave', { n: pending.length })],
          ['trips', t('leave.apTabTrips', { n: waitingTrips.length })],
          ...(canTransfer ? ([['transfers', t('leave.apTabTransfers', { n: toTransfer })]] as [typeof tab, string][]) : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      </div>
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[13px] text-neutral-600">{lead}</p>
        <Link to={isTrips ? '/trips/calendar' : '/calendar'} className="text-[13px] font-bold text-brand-500">
          {t('leave.calendar')}
        </Link>
      </div>
      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      ) : isTransfers ? (
        <TripTransfersPanel trips={ledger} onChanged={load} />
      ) : (
        <div className="space-y-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-3.5">
          <p className="px-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('leave.waitingHeader', { n: waitingCount })}</p>
          {isTrips ? (
            waitingTrips.length === 0 ? (
              <p className="rounded-2xl border border-neutral-100 bg-white p-5 text-center text-[13.5px] text-neutral-500 shadow-card">{t('leave.noTripWaiting')}</p>
            ) : (
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
                {waitingTrips.map((t) => (
                  <TripApprovalCard key={t.id} trip={t} rates={rates} onDecided={load} />
                ))}
              </div>
            )
          ) : pending.length === 0 ? (
            <p className="rounded-2xl border border-neutral-100 bg-white p-5 text-center text-[13.5px] text-neutral-500 shadow-card">{t('leave.noLeaveWaiting')}</p>
          ) : (
            <ApprovalsTab requests={pending} nameById={nameById} onChanged={load} />
          )}

          </div>

          <div className="space-y-3.5 lg:sticky lg:top-20">
          <p className="px-0.5 pt-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500 lg:pt-0">{t('leave.decided30')}</p>
          <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            {(isTrips ? decidedTrips.length : decidedLeave.length) === 0 && <p className="p-4 text-center text-[13px] text-neutral-500">{t('leave.nothingDecided')}</p>}
            {isTrips
              ? decidedTrips.map((trip, i) => (
                  <Link key={trip.id} to={`/trips/${trip.id}`} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{ini(trip.requester)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-neutral-900">{trip.requester}</span>
                      <span className="block truncate text-[12px] text-neutral-500">
                        {t('leave.salesTrip')} · {dayLabel(trip.start_date)} – {dayLabel(trip.end_date)} · {t('leave.decidedOn', { date: when(trip.decided_at) })}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${pill(trip.status)}`}>{trip.status === 'approved' ? t('leave.statusApproved') : trip.status === 'changes' ? t('leave.changesAsked') : t('leave.declined')}</span>
                  </Link>
                ))
              : decidedLeave.map((r, i) => (
                  <div key={r.id} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{ini(nameById[r.user_id] ?? '?')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-neutral-900">{nameById[r.user_id] ?? t('leave.someone')}</span>
                      <span className="block truncate text-[12px] text-neutral-500">
                        {leaveTitleOf(r.leave_type, t)} · {leaveDateRangeLabel(r.start_date, r.end_date, r.start_period, r.end_period, t)} · {t('leave.decidedOn', { date: when(r.decided_at) })}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${pill(r.status)}`}>{r.status === 'approved' ? t('leave.statusApproved') : t('leave.declined')}</span>
                  </div>
                ))}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
