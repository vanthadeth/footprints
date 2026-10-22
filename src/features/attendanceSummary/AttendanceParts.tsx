import { LEAVE_TYPE_LABEL } from '@/features/leave/types'
import { formatTime } from '@/lib/datetime'
import type { DetailItem, DetailKind } from './attendanceDetails'

/** A number tile as in the Weekly attendance view: bold grey label, big figure in the status colour, one grey line. */
export function Kpi({ label, value, sub, tone = 'text-neutral-900', className = '' }: { label: string; value: string; sub: string; tone?: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-card ${className}`}>
      <p className="text-xs font-bold text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="truncate text-xs text-neutral-500">{sub}</p>
    </div>
  )
}

/** A colour swatch and its meaning, for the line under the grid. */
export function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  )
}

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
