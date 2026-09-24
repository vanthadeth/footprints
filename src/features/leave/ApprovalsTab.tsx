import { useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveDateRangeLabel } from './leaveDate'
import type { LeaveRequest, LeaveType } from './types'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid' }

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
        {LEAVE_TYPE_LABEL[request.leave_type]} Leave · {leaveDateRangeLabel(request.start_date, request.end_date, request.start_period, request.end_period)}
      </p>
      {request.reason && <p className="mt-1 text-xs text-neutral-400">{request.reason}</p>}

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
