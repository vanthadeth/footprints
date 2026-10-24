import type { LeaveStatus } from './types'

const TONE: Record<LeaveStatus, string> = {
  pending: 'bg-status-warn/10 text-status-warn',
  approved: 'bg-status-working/10 text-status-working',
  rejected: 'bg-status-danger/10 text-status-danger',
  cancelled: 'bg-neutral-100 text-neutral-500',
}

const LABEL: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

/** Same small-chip convention as FlagBadge/FleetStatusBadge. */
export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE[status]}`}>{LABEL[status]}</span>
}
