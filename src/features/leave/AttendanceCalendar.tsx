import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { buildAttendanceMonth, type AttendanceCell } from './attendanceMonth'
import { LEAVE_TYPE_COLOR, type LeaveRequest } from './types'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const LEAVE_CODE = { annual: 'AL', sick: 'SL', unpaid: 'UL' } as const

/** Month calendar of the signed-in user's own attendance: P for days clocked in, AL/SL/UL for approved leave. */
export function AttendanceCalendar({ userId, requests }: { userId: string; requests: LeaveRequest[] }) {
  const today = todayDateString()
  const [ty, tm] = today.split('-').map(Number)
  const [cursor, setCursor] = useState({ year: ty, month: tm })
  const [selected, setSelected] = useState<string | null>(null)

  const range = useMemo(() => {
    const last = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate()
    const mm = String(cursor.month).padStart(2, '0')
    return getCustomRange(`${cursor.year}-${mm}-01`, `${cursor.year}-${mm}-${last}`)
  }, [cursor])
  const { days, loading } = useJourneyHistory(userId, range)

  const month = useMemo(() => {
    const present = new Set(days.filter((d) => d.attendance.length > 0).map((d) => d.date))
    return buildAttendanceMonth(cursor.year, cursor.month, present, requests, today)
  }, [days, requests, cursor, today])

  const isCurrentMonth = cursor.year === ty && cursor.month === tm
  const step = (delta: number) => {
    setSelected(null)
    setCursor(({ year, month: m }) => {
      const idx = year * 12 + (m - 1) + delta
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
    })
  }
  const totalLeave = month.leaveDays.annual + month.leaveDays.sick + month.leaveDays.unpaid
  const selectedCell = month.weeks.flat().find((c) => c?.date === selected) ?? null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl2 bg-white p-3.5 shadow-card">
          <p className="text-xs font-medium text-neutral-500">Present</p>
          <p className="mt-1 text-2xl font-extrabold text-status-working">{month.presentDays}</p>
          <p className="text-[11px] text-neutral-500">days this month</p>
        </div>
        <div className="rounded-xl2 bg-white p-3.5 shadow-card">
          <p className="text-xs font-medium text-neutral-500">On leave</p>
          <p className="mt-1 text-2xl font-extrabold text-neutral-900">{totalLeave}</p>
          <p className="text-[11px] text-neutral-500">
            AL {month.leaveDays.annual} · SL {month.leaveDays.sick} · UL {month.leaveDays.unpaid}
          </p>
        </div>
      </div>

      <div className="rounded-xl2 bg-white p-3.5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => step(-1)} aria-label="Previous month" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 tap-target">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="text-[15px] font-bold text-neutral-900">
            {MONTH_NAMES[cursor.month - 1]} {cursor.year}
          </p>
          <button
            onClick={() => step(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 tap-target disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-neutral-500">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className={`mt-1 space-y-1 ${loading ? 'opacity-50' : ''}`}>
          {month.weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((cell, ci) =>
                cell ? (
                  <DayCell key={ci} cell={cell} selected={cell.date === selected} onPick={() => setSelected(cell.date === selected ? null : cell.date)} />
                ) : (
                  <span key={ci} />
                )
              )}
            </div>
          ))}
        </div>
        {selectedCell && <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">{describe(selectedCell)}</p>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-neutral-500">
        <Legend color="#0f6e4f" code="P" label="Present" />
        <Legend color={LEAVE_TYPE_COLOR.annual} code="AL" label="Annual" />
        <Legend color={LEAVE_TYPE_COLOR.sick} code="SL" label="Sick" />
        <Legend color={LEAVE_TYPE_COLOR.unpaid} code="UL" label="Unpaid" />
        <span>½ = half day</span>
      </div>
    </div>
  )
}

function DayCell({ cell, selected, onPick }: { cell: AttendanceCell; selected: boolean; onPick: () => void }) {
  let bg = ''
  let fg = 'text-neutral-900'
  let code = ''
  if (cell.kind === 'present') {
    bg = 'bg-status-working/15'
    fg = 'text-status-working dark:text-emerald-300'
    code = 'P'
  } else if (cell.kind === 'leave' && cell.leaveType) {
    code = LEAVE_CODE[cell.leaveType] + (cell.half ? '½' : '')
    fg = 'text-white'
  } else if (cell.kind === 'weekend' || cell.kind === 'future') {
    fg = 'text-neutral-400'
  }
  const style = cell.kind === 'leave' && cell.leaveType ? { backgroundColor: LEAVE_TYPE_COLOR[cell.leaveType] } : undefined
  return (
    <button
      type="button"
      onClick={onPick}
      style={style}
      aria-label={describe(cell)}
      aria-pressed={selected}
      className={`flex h-11 flex-col items-center justify-center rounded-lg ${bg} ${fg} ${cell.isToday ? 'ring-2 ring-brand-500' : ''} ${
        selected ? 'outline outline-2 outline-offset-1 outline-neutral-400' : ''
      }`}
    >
      <span className="text-[13px] font-bold leading-none">{cell.day}</span>
      {code && <span className="mt-0.5 text-[9px] font-extrabold leading-none">{code}</span>}
    </button>
  )
}

function Legend({ color, code, label }: { color: string; code: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[8px] font-extrabold text-white" style={{ backgroundColor: color }}>
        {code}
      </span>
      {label}
    </span>
  )
}

function describe(cell: AttendanceCell): string {
  const [y, m, d] = cell.date.split('-').map(Number)
  const label = `${d} ${MONTH_NAMES[m - 1]} ${y}`
  switch (cell.kind) {
    case 'present':
      return `${label} · Present`
    case 'leave':
      return `${label} · ${cell.leaveType === 'annual' ? 'Annual' : cell.leaveType === 'sick' ? 'Sick' : 'Unpaid'} leave${cell.half ? ' (half day)' : ''}${cell.alsoPresent ? ' · also clocked in' : ''}`
    case 'weekend':
      return `${label} · Sunday`
    case 'future':
      return `${label} · Upcoming`
    default:
      return `${label} · No attendance recorded`
  }
}
