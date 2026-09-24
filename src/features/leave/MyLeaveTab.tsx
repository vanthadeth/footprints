import { useState } from 'react'
import { Check, CalendarDays, Plus } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { DateTile } from '@/components/DateTile'
import { todayDateString } from '@/lib/dateRange'
import { RequestLeaveSheet } from './RequestLeaveSheet'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import { BalanceCards } from './BalanceCards'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveDateRangeLabel } from './leaveDate'
import { LEAVE_TYPE_LABEL, type LeaveBalanceSummary, type LeaveRequest } from './types'

export function MyLeaveTab({
  requests,
  balances,
  approverName,
  onChanged,
}: {
  requests: LeaveRequest[]
  balances: LeaveBalanceSummary[]
  /** The direct manager who decides these requests, for the approval steps; null when none is assigned (HR/Super Admin decide). */
  approverName: string | null
  onChanged: () => void
}) {
  const [requestOpen, setRequestOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayDateString()

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

  const upcoming = requests
    .filter((r) => (r.status === 'pending' || r.status === 'approved') && r.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const history = requests.filter((r) => !upcoming.includes(r))

  return (
    <div className="space-y-4">
      <BalanceCards balances={balances} requests={requests} linkTo="/leave?tab=balance" />

      <button
        onClick={() => setRequestOpen(true)}
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(22,104,184,0.28)] tap-target"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} /> Request leave
      </button>

      {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-0.5 text-[17px] font-bold text-neutral-900">Upcoming</h2>
          {upcoming.map((r) => (
            <div key={r.id} className="space-y-3 rounded-2xl bg-white p-3.5 shadow-card">
              <div className="flex items-center gap-3">
                <DateTile date={r.start_date} accent />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-neutral-900">{LEAVE_TYPE_LABEL[r.leave_type]} Leave</p>
                  <p className="mt-0.5 text-[12.5px] text-neutral-500">{leaveDateRangeLabel(r.start_date, r.end_date, r.start_period, r.end_period)}</p>
                </div>
                <LeaveStatusBadge status={r.status} />
              </div>
              <ApprovalSteps status={r.status} approverName={approverName} />
              {r.status === 'pending' && (
                <button
                  onClick={() => cancel(r.id)}
                  disabled={busyId === r.id}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 tap-target disabled:opacity-40"
                >
                  {busyId === r.id ? 'Cancelling…' : 'Cancel request'}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-0.5 text-[17px] font-bold text-neutral-900">History</h2>
        {history.length === 0 ? (
          upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No leave requests yet" body="Tap Request leave to submit your first one." />
          ) : (
            <p className="px-0.5 text-sm text-neutral-500">Nothing in the past yet.</p>
          )
        ) : (
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
            {history.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3.5 py-3">
                <DateTile date={r.start_date} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-neutral-900">{LEAVE_TYPE_LABEL[r.leave_type]} Leave</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{leaveDateRangeLabel(r.start_date, r.end_date, r.start_period, r.end_period)}</p>
                  {r.status !== 'pending' && r.decision_note && <p className="mt-0.5 text-xs text-neutral-400">Note: {r.decision_note}</p>}
                </div>
                <LeaveStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <RequestLeaveSheet open={requestOpen} onClose={() => setRequestOpen(false)} onSubmitted={onChanged} />
    </div>
  )
}

/** Sent → approver → decided, as a three-dot stepper. */
function ApprovalSteps({ status, approverName }: { status: LeaveRequest['status']; approverName: string | null }) {
  const decided = status === 'approved'
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-working text-white">
        <Check className="h-3 w-3" strokeWidth={3.2} aria-hidden />
      </span>
      <span className="text-neutral-600">Sent</span>
      <span className="h-0.5 flex-1 rounded bg-neutral-100" />
      {decided ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-working text-white">
          <Check className="h-3 w-3" strokeWidth={3.2} aria-hidden />
        </span>
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-status-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-status-warn" />
        </span>
      )}
      <span className="max-w-[110px] truncate text-neutral-600">{approverName ?? 'Manager'}</span>
      <span className="h-0.5 flex-1 rounded bg-neutral-100" />
      <span className={`h-5 w-5 rounded-full ${decided ? 'bg-status-working' : 'border-2 border-neutral-200'}`} />
      <span className={decided ? 'text-neutral-600' : 'text-neutral-400'}>Approved</span>
    </div>
  )
}
