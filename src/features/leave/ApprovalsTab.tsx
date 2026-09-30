import { useEffect, useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveDateRangeLabel } from './leaveDate'
import type { LeaveRequest, LeaveType } from './types'
import { flexService } from '@/features/flex/flexService'
import { cycleLabel, days as fmtDays, type FlexCycle } from '@/features/flex/flex'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', flex: 'Flexible day off' }

export function ApprovalsTab({
  requests,
  nameById,
  onChanged,
}: {
  requests: LeaveRequest[]
  nameById: Record<string, string>
  onChanged: () => void
}) {
  return (
    <div>
      {requests.length === 0 ? (
        <EmptyState icon={CheckCheck} title="No pending requests" body="Nothing needs your approval right now." />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <ApprovalRow key={r.id} request={r} name={nameById[r.user_id] ?? 'Unknown'} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovalRow({ request, name, onChanged }: { request: LeaveRequest; name: string; onChanged: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(approve: boolean) {
    setBusy(true)
    setError(null)
    try {
      await leaveService.decideLeaveRequest(request.id, approve, note.trim() || null)
      onChanged()
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl2 bg-white p-3.5 shadow-card">
      <p className="text-sm font-semibold text-neutral-900">{name}</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        {request.leave_type === 'flex' ? 'Flexible day off' : `${LEAVE_TYPE_LABEL[request.leave_type]} Leave`} · {leaveDateRangeLabel(request.start_date, request.end_date, request.start_period, request.end_period)}
      </p>
      {request.reason && <p className="mt-1 text-xs text-neutral-400">{request.reason}</p>}
      {request.leave_type === 'flex' && <FlexBalance userId={request.user_id} date={request.start_date} />}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="mt-2.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-800 outline-none focus:border-brand-400"
      />

      {error && <p className="mt-2 text-xs text-status-danger">{error}</p>}

      <div className="mt-2.5 flex gap-2">
        <button
          onClick={() => decide(true)}
          disabled={busy}
          className="flex-1 rounded-lg bg-status-working py-2 text-xs font-semibold text-white tap-target disabled:opacity-40"
        >
          Approve
        </button>
        <button
          onClick={() => decide(false)}
          disabled={busy}
          className="flex-1 rounded-lg border border-neutral-200 py-2 text-xs font-semibold text-neutral-600 tap-target disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

/** For a flexible day off request: the person's balance for that cycle, counting this request as planned. */
function FlexBalance({ userId, date }: { userId: string; date: string }) {
  const [cycle, setCycle] = useState<FlexCycle | null>(null)
  useEffect(() => {
    let cancelled = false
    flexService
      .cycle(userId, date)
      .then((c) => !cancelled && setCycle(c))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, date])
  if (!cycle) return null
  const over = cycle.left < 0
  return (
    <p className={`mt-2 rounded-lg px-2.5 py-2 text-xs leading-snug ${over ? 'bg-status-warn/10 text-status-warn' : 'bg-status-visiting/10 text-status-visiting dark:text-violet-300'}`}>
      <span className="font-bold">Cycle {cycleLabel(cycle)}:</span> {fmtDays(cycle.allowance)} days · taken {fmtDays(cycle.taken)} · planned {fmtDays(cycle.planned)} incl. this ·{' '}
      {over ? `goes ${fmtDays(-cycle.left)} over — the extra comes from annual leave when the cycle settles` : `${fmtDays(cycle.left)} left after this`}
    </p>
  )
}
