import { LEAVE_TYPE_LABEL } from '@/features/leave/types'
import { formatTime } from '@/lib/datetime'
import type { DetailItem, DetailKind } from './attendanceDetails'

/** What each kind of "needs a look" person shows as: a pill label, its colours and a grey detail line. */
export const KIND_STYLE: Record<DetailKind, { label: (i: DetailItem) => string; tag: string; sub: (i: DetailItem) => string }> = {
  absent: { label: () => 'Absent', tag: 'bg-status-danger/10 text-status-danger', sub: () => 'No clock-in, no leave' },
  notin: { label: () => 'Not in yet', tag: 'bg-status-danger/10 text-status-danger', sub: () => 'On shift, not clocked in' },
  late: { label: (i) => `${i.lateMinutes} min late`, tag: 'bg-status-warn/10 text-status-warn', sub: (i) => (i.firstIn ? `Clocked in ${formatTime(i.firstIn)}` : '') },
  leave: {
    label: (i) => (i.leaveType === 'flex' ? 'Day off' : i.leaveType ? `${LEAVE_TYPE_LABEL[i.leaveType]} leave` : 'Leave'),
    tag: 'bg-brand-50 text-brand-700',
    sub: (i) => (i.leaveFraction < 1 ? 'Half day' : 'Full day'),
  },
  dayoff: { label: () => 'Day off (auto)', tag: 'bg-status-visiting/10 text-status-visiting', sub: () => 'No clock-in · uses a flexible day off' },
}
