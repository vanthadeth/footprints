import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { fullDate, monthYear } from '@/features/customers/detail/dates'
import { enT, type Tr } from '@/features/customers/book'
import { leaveTypeName } from './leaveText'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { buildAttendanceMonth, type AttendanceCell } from './attendanceMonth'
import type { LeaveRequest } from './types'

const LEAVE_CODE = { annual: 'AL', sick: 'SL', unpaid: 'UL', flex: 'FD' } as const

/** Month calendar of the signed-in user's own attendance: P for days clocked in, AL/SL/UL for approved leave. */
export function AttendanceCalendar({ userId, requests }: { userId: string; requests: LeaveRequest[] }) {
  const { t, language } = useLanguage()
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
          <p className="text-xs font-medium text-neutral-500">{t('leave.present')}</p>
          <p className="mt-1 text-2xl font-extrabold text-status-working">{month.presentDays}</p>
          <p className="text-[11px] text-neutral-500">{t('leave.daysThisMonth')}</p>
        </div>
        <div className="rounded-xl2 bg-white p-3.5 shadow-card">
          <p className="text-xs font-medium text-neutral-500">{t('leave.onLeave')}</p>
          <p className="mt-1 text-2xl font-extrabold text-neutral-900">{totalLeave}</p>
          <p className="text-[11px] text-neutral-500">
            AL {month.leaveDays.annual} · SL {month.leaveDays.sick} · UL {month.leaveDays.unpaid}
          </p>
        </div>
      </div>

      <div className="rounded-xl2 bg-white p-3.5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => step(-1)} aria-label={t('leave.prevMonth')} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 tap-target">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="text-[15px] font-bold text-neutral-900">
            {monthYear(`${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`, language)}
          </p>
          <button
            onClick={() => step(1)}
            disabled={isCurrentMonth}
            aria-label={t('leave.nextMonth')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 tap-target disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-neutral-500">
          {t('leave.wdInitials').split(',').map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className={`mt-1 space-y-1 ${loading ? 'opacity-50' : ''}`}>
          {month.weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((cell, ci) =>
                cell ? (
                  <DayCell key={ci} cell={cell} t={t} language={language} selected={cell.date === selected} onPick={() => setSelected(cell.date === selected ? null : cell.date)} />
                ) : (
                  <span key={ci} />
                )
              )}
            </div>
          ))}
        </div>
        {selectedCell && <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">{describe(selectedCell, t, language)}</p>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-neutral-500">
        <Legend swatch="today" label={t('leave.legToday')} />
        <Legend swatch="dot" label={t('leave.legPresent')} />
        <Legend swatch="leave" label={t('leave.legLeave')} />
        <span>{t('leave.legHalf')}</span>
      </div>
    </div>
  )
}

/** The app's one calendar cell: a 28px day circle (today ringed, picked filled), leave as a grey cell with its code, presence as a green dot. */
function DayCell({ cell, selected, onPick, t, language }: { cell: AttendanceCell; selected: boolean; onPick: () => void; t: Tr; language: 'en' | 'km' }) {
  const leave = cell.kind === 'leave' && cell.leaveType
  const muted = cell.kind === 'weekend' || cell.kind === 'future'
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={describe(cell, t, language)}
      aria-pressed={selected}
      className={`flex h-[50px] flex-col items-center justify-center gap-0.5 rounded-xl ${leave ? 'bg-neutral-100' : ''}`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
          selected ? 'bg-brand-500 font-bold text-white' : cell.isToday ? 'font-bold text-brand-500 ring-2 ring-inset ring-brand-500' : muted ? 'font-medium text-neutral-500' : 'font-medium text-neutral-900'
        }`}
      >
        {cell.day}
      </span>
      {leave ? (
        <span className="text-[9px] font-extrabold leading-none text-neutral-600">{LEAVE_CODE[cell.leaveType!] + (cell.half ? '½' : '')}</span>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${cell.kind === 'present' ? 'bg-status-working' : 'bg-transparent'}`} />
      )}
    </button>
  )
}

function Legend({ swatch, label }: { swatch: 'dot' | 'leave' | 'today'; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch === 'dot' && <span className="h-1.5 w-1.5 rounded-full bg-status-working" />}
      {swatch === 'leave' && <span className="h-3 w-4 rounded bg-neutral-100 ring-1 ring-inset ring-neutral-200" />}
      {swatch === 'today' && <span className="h-3 w-3 rounded-full ring-2 ring-inset ring-brand-500" />}
      {label}
    </span>
  )
}

function describe(cell: AttendanceCell, t: Tr = enT, language: 'en' | 'km' = 'en'): string {
  const date = fullDate(cell.date, language)
  switch (cell.kind) {
    case 'present':
      return t('leave.dayPresent', { date })
    case 'leave':
      return t('leave.dayLeave', { date, type: leaveTypeName(cell.leaveType ?? 'unpaid', t), half: cell.half ? t('leave.halfDay') : '', also: cell.alsoPresent ? t('leave.alsoIn') : '' })
    case 'weekend':
      return t('leave.daySunday', { date })
    case 'future':
      return t('leave.dayUpcoming', { date })
    default:
      return t('leave.dayNone', { date })
  }
}
