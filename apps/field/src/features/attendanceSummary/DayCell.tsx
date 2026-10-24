import type { AttendanceDay } from './attendanceSummary'

const LEAVE_SHORT = { annual: 'AL', sick: 'SL', unpaid: 'UL', flex: 'FD' } as const

/** One person-day in the weekly grid: ✓ on time, minutes late, A absent, AL/SL/UL leave (½ for a half day), striped holiday, · day off. */
export function DayCell({ row, dow }: { row: AttendanceDay | undefined; dow: string }) {
  if (!row || row.status === 'upcoming') return <span className="h-[30px] rounded-md bg-neutral-50" aria-label={`${dow}: upcoming`} />
  const base = 'flex h-[30px] items-center justify-center rounded-md text-[10.5px] font-extrabold'
  switch (row.status) {
    case 'present':
      return (
        <span className={`${base} bg-status-working/10 text-status-working`} aria-label={`${dow}: on time${row.leaveFraction ? ', half-day leave' : ''}`}>
          {row.leaveFraction ? '½' : '✓'}
        </span>
      )
    case 'late':
      return (
        <span className={`${base} border-[1.5px] border-status-warn bg-status-warn/10 text-status-warn`} aria-label={`${dow}: ${row.lateMinutes} minutes late`}>
          {row.lateMinutes}
        </span>
      )
    case 'absent':
      return (
        <span className={`${base} border-[1.5px] border-status-danger bg-status-danger/10 text-status-danger`} aria-label={`${dow}: absent`}>
          A
        </span>
      )
    case 'dayoff':
      return (
        <span className={`${base} bg-status-visiting/10 text-status-visiting`} aria-label={`${dow}: day off, no clock-in`}>
          Off
        </span>
      )
    case 'leave':
      return (
        <span className={`${base} bg-brand-50 text-brand-700`} aria-label={`${dow}: ${row.leaveType ?? ''} leave`}>
          {row.leaveType ? LEAVE_SHORT[row.leaveType] : 'L'}
          {row.leaveFraction < 1 ? '½' : ''}
        </span>
      )
    case 'holiday':
      return <span className={`${base} holiday-stripes text-earth-500`} aria-label={`${dow}: ${row.holidayName ?? 'public holiday'}`} title={row.holidayName ?? undefined} />
    default:
      return (
        <span className={`${base} text-neutral-300`} aria-label={`${dow}: day off`}>
          ·
        </span>
      )
  }
}
