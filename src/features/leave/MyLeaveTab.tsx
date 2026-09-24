import { useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { RequestLeaveSheet } from './RequestLeaveSheet'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveDateRangeLabel } from './leaveDate'
import type { LeaveBalanceSummary, LeaveRequest, LeaveType } from './types'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid' }

export function MyLeaveTab({
  requests,
  balances,
  onChanged,
}: {
  requests: LeaveRequest[]
  balances: LeaveBalanceSummary[]
  onChanged: () => void
}) {
  const [requestOpen, setRequestOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cancel(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await leaveService.cancelLeaveRequest(id)
      onChanged()
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const annual = balances.find((b) => b.leave_type === 'annual')
  const sick = balances.find((b) => b.leave_type === 'sick')

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <BalanceCard label="Annual" balance={annual} />
        <BalanceCard label="Sick" balance={sick} />
        <div className="rounded-xl2 bg-white p-3 shadow-card">
          <p className="text-xs font-medium text-neutral-500">Unpaid</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">Uncapped</p>
        </div>
      </div>

      <button
        onClick={() => setRequestOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl2 bg-brand-500 py-3 text-sm font-semibold text-white tap-target"
      >
        <Plus className="h-4 w-4" /> Request Leave
      </button>

      {error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <div className="mt-4">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">My Requests</p>
        {requests.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No leave requests yet" body="Tap Request Leave to submit your first one." />
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl2 bg-white p-3.5 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{LEAVE_TYPE_LABEL[r.leave_type]} Leave</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {leaveDateRangeLabel(r.start_date, r.end_date, r.start_period, r.end_period)}
                    </p>
                    {r.reason && <p className="mt-1 text-xs text-neutral-400">{r.reason}</p>}
                    {r.status !== 'pending' && r.decision_note && <p className="mt-1 text-xs text-neutral-400">Note: {r.decision_note}</p>}
                  </div>
                  <LeaveStatusBadge status={r.status} />
                </div>
                {r.status === 'pending' && (
                  <button
                    onClick={() => cancel(r.id)}
                    disabled={busyId === r.id}
                    className="mt-2.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 tap-target disabled:opacity-40"
                  >
                    {busyId === r.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <RequestLeaveSheet open={requestOpen} onClose={() => setRequestOpen(false)} onSubmitted={onChanged} />
    </div>
  )
}

function BalanceCard({ label, balance }: { label: string; balance: LeaveBalanceSummary | undefined }) {
  return (
    <div className="rounded-xl2 bg-white p-3 shadow-card">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900">
        {balance ? `${balance.remaining_days}/${balance.quota_days}` : '0/0'}
      </p>
      <p className="text-[11px] text-neutral-400">days left</p>
    </div>
  )
}
