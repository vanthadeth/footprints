import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatTime } from '@footprints/shared/lib/datetime'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useJourneyHistory } from '@/features/attendance/useJourneyHistory'
import { fullDate, monthYear, dayMonth } from '@/features/customers/detail/dates'
import { enT, type Tr } from '@/features/customers/book'
import { holidaysService } from '@/features/holidays/holidaysService'
import { holidayName, type Holiday } from '@/features/holidays/holidays'
import { useFlexProgress } from '@/features/flex/useFlexProgress'
import { counted } from '@/features/flex/progress'
import { cycleLabel, dayDate, days as fmtDays } from '@/features/flex/flex'
import { leaveTypeName } from './leaveText'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { buildAttendanceMonth, type AttendanceCell } from './attendanceMonth'
import type { LeaveRequest } from './types'

const LEAVE_CODE = { annual: 'AL', sick: 'SL', unpaid: 'UL', flex: 'FD' } as const

/** Full-day, everyone-wide holidays as date → name, for the calendar. */
function holidayMap(list: Holiday[], t: Tr): Map<string, string> {
  const m = new Map<string, string>()
  for (const h of list) {
    if (h.halfDay || h.departmentIds) continue
    for (let d = Date.parse(`${h.startDate}T00:00:00Z`); d <= Date.parse(`${h.endDate}T00:00:00Z`); d += 86_400_000) m.set(new Date(d).toISOString().slice(0, 10), holidayName(h.name, t))
  }
  return m
}

/** Month calendar of the signed-in user's own attendance: P for days clocked in, AL/SL/UL for approved leave. */
export function AttendanceCalendar({ userId, requests }: { userId: string; requests: LeaveRequest[] }) {
  const { t, language } = useLanguage()
  const today = todayDateString()
  const [ty, tm] = today.split('-').map(Number)
  const [cursor, setCursor] = useState({ year: ty, month: tm })
  const [selected, setSelected] = useState<string>(today)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const flex = useFlexProgress()

  useEffect(() => {
    holidaysService.listYear(cursor.year).then(setHolidays).catch(() => setHolidays([]))
  }, [cursor.year])
  const holMap = useMemo(() => holidayMap(holidays, t), [holidays, t])

  const range = useMemo(() => {
    const last = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate()
    const mm = String(cursor.month).padStart(2, '0')
    return getCustomRange(`${cursor.year}-${mm}-01`, `${cursor.year}-${mm}-${last}`)
  }, [cursor])
  const { days, loading } = useJourneyHistory(userId, range)

  const month = useMemo(() => {
    const present = new Set(days.filter((d) => d.attendance.length > 0).map((d) => d.date))
    return buildAttendanceMonth(cursor.year, cursor.month, present, requests, today, holMap)
  }, [days, requests, cursor, today, holMap])

  const isCurrentMonth = cursor.year === ty && cursor.month === tm
  const step = (delta: number) => {
    setCursor(({ year, month: m }) => {
      const idx = year * 12 + (m - 1) + delta
      const next = { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
      setSelected(next.year === ty && next.month === tm ? today : `${next.year}-${String(next.month).padStart(2, '0')}-01`)
      return next
    })
  }
  const totalLeave = month.leaveDays.annual + month.leaveDays.sick + month.leaveDays.unpaid
  const leaveSub = (['annual', 'sick', 'unpaid'] as const).filter((k) => month.leaveDays[k] > 0).map((k) => `${LEAVE_CODE[k]} ${fmtDays(month.leaveDays[k])}`).join(' · ')
  const selectedCell = month.weeks.flat().find((c) => c?.date === selected) ?? null
  const sessions = days.find((d) => d.date === selected)?.attendance ?? []
  const isFlex = !!flex.progress?.isFlexible && flex.progress.minDays != null

  const upcoming = useMemo(() => {
    const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10)
    const items: { key: string; date: string; title: string; sub: string; chip: React.ReactNode }[] = []
    for (const r of requests) {
      if ((r.status !== 'approved' && r.status !== 'pending') || r.end_date < today || r.start_date > horizon) continue
      items.push({ key: r.id, date: r.start_date, title: leaveTypeName(r.leave_type, t), sub: r.start_date === r.end_date ? dayMonth(r.start_date, language) : `${dayMonth(r.start_date, language)} – ${dayMonth(r.end_date, language)}`, chip: <LeaveStatusBadge status={r.status} /> })
    }
    for (const h of holidays) {
      if (h.endDate < today || h.startDate > horizon) continue
      items.push({ key: h.id, date: h.startDate, title: holidayName(h.name, t), sub: t('leaveTabs.holidaySub'), chip: <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800">{t('leaveTabs.holidayTag')}</span> })
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [requests, holidays, today, t, language])

  return (
    <div className="space-y-3">
      {isFlex && flex.progress && (
        <Link to="/leave/days-off" className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CalendarCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold text-neutral-900">{t('leaveTabs.wdLink', { have: fmtDays(counted(flex.progress)), min: flex.progress.minDays ?? 0 })}</span>
            <span className="block truncate text-xs text-neutral-500">{t('leaveTabs.wdLinkSub', { cycle: cycleLabel(flex.progress, language), date: dayDate(flex.progress.cycleEnd, language) })}</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {([
          [isFlex ? t('leaveTabs.calWorked') : t('leave.present'), String(month.presentDays), 'text-status-working', ''],
          [t('leave.onLeave'), String(fmtDays(totalLeave)), 'text-neutral-500', leaveSub],
          [t('leaveTabs.calHolidays'), String(month.holidayDays), 'text-neutral-500', ''],
          [isFlex ? t('leaveTabs.calNoClock') : t('leaveTabs.calMissed'), String(month.missedDays), 'text-status-danger', ''],
        ] as const).map(([label, value, tone, sub]) => (
          <div key={label} className="flex flex-col rounded-xl2 bg-white px-2.5 py-2.5 shadow-card">
            <span className={`text-[22px] font-extrabold leading-[26px] ${tone}`}>{fmtDays(Number(value))}</span>
            <span className="truncate text-xs text-neutral-500">{label}</span>
            {sub && <span className="truncate text-[10px] font-bold text-neutral-500">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="rounded-xl2 bg-white p-3.5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => step(-1)} aria-label={t('leave.prevMonth')} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 tap-target">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="text-[15px] font-bold text-neutral-900">{monthYear(`${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`, language)}</p>
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
                  <DayCell key={ci} cell={cell} t={t} language={language} selected={cell.date === selected} onPick={() => setSelected(cell.date)} />
                ) : (
                  <span key={ci} />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-neutral-500">
        <Legend swatch="dot" label={t('leave.legPresent')} />
        <Legend swatch="leave" label={t('leaveTabs.legLeaveShort')} />
        <Legend swatch="missed" label={t('leaveTabs.legMissed')} />
        <Legend swatch="holiday" label={t('leaveTabs.legHoliday')} />
        <span>{t('leave.legHalf')}</span>
      </div>

      {selectedCell && <DayCard cell={selectedCell} sessions={sessions} today={today} requests={requests} t={t} language={language} />}

      <section className="space-y-2">
        <h2 className="px-1 pt-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('leaveTabs.comingUp')}</h2>
        <div className="rounded-2xl bg-white px-4 shadow-card">
          {upcoming.length === 0 && <p className="py-4 text-center text-[13px] text-neutral-500">{t('leaveTabs.comingNone')}</p>}
          {upcoming.map((u) => (
            <div key={u.key} className="flex items-center gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-800">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold text-neutral-900">{u.title}</span>
                <span className="block text-xs text-neutral-500">{u.sub}</span>
              </span>
              {u.chip}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** The selected day: its result, clock times and hours, leave, or the missed-day note. */
function DayCard({ cell, sessions, today, requests, t, language }: { cell: AttendanceCell; sessions: { clock_in_at: string; clock_out_at: string | null }[]; today: string; requests: LeaveRequest[]; t: Tr; language: 'en' | 'km' }) {
  const first = sessions[0]
  const last = sessions[sessions.length - 1]
  const open = !!last && !last.clock_out_at
  const ms = sessions.reduce((a, s) => a + ((s.clock_out_at ? Date.parse(s.clock_out_at) : Date.now()) - Date.parse(s.clock_in_at)), 0)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const req = cell.kind === 'leave' ? requests.find((r) => r.status === 'approved' && r.start_date <= cell.date && cell.date <= r.end_date) : undefined
  const chip =
    cell.kind === 'present' ? { text: t('leaveTabs.stPresent'), cls: 'bg-status-working/10 text-status-working' }
    : cell.kind === 'leave' ? { text: leaveTypeName(cell.leaveType ?? 'unpaid', t), cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' }
    : cell.kind === 'holiday' ? { text: t('leaveTabs.stHoliday'), cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' }
    : cell.kind === 'weekend' ? { text: t('leaveTabs.stDayOff'), cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' }
    : cell.kind === 'future' ? { text: t('leaveTabs.stUpcoming'), cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' }
    : cell.date === today ? { text: t('leaveTabs.stNoClockYet'), cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' }
    : { text: t('leaveTabs.stMissed'), cls: 'bg-status-danger/10 text-status-danger' }
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-3 border-t border-neutral-100 pt-2.5 text-[13.5px] dark:border-neutral-800">
      <span className="text-neutral-500">{k}</span>
      <span className="text-right font-bold text-neutral-900">{v}</span>
    </div>
  )
  return (
    <section className="space-y-2.5 rounded-2xl bg-white p-4 shadow-card" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold text-neutral-900">{fullDate(cell.date, language)}</p>
          {cell.date === today && <p className="text-[12.5px] text-neutral-500">{t('leaveTabs.dayToday')}</p>}
          {cell.kind === 'holiday' && <p className="text-[12.5px] text-neutral-500">{cell.holidayName}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>
      </div>
      {sessions.length > 0 && (
        <>
          <Row k={t('leaveTabs.dayClockIn')} v={formatTime(first.clock_in_at)} />
          <Row k={t('leaveTabs.dayClockOut')} v={open ? t('leaveTabs.dayStillWorking') : formatTime(last.clock_out_at)} />
          <Row k={t('leaveTabs.dayHours')} v={t(open ? 'leaveTabs.dayHoursSoFar' : 'leaveTabs.dayHoursVal', { h, m })} />
        </>
      )}
      {cell.kind === 'leave' && req && <Row k={t('leaveTabs.dayLeave')} v={t('leaveTabs.dayLeaveVal', { type: leaveTypeName(req.leave_type, t), half: cell.half ? t('leave.halfDay') : '' })} />}
      {cell.kind === 'none' && cell.date < today && (
        <>
          <Row k={t('leaveTabs.dayClockIn')} v={t('leaveTabs.dayNoneVal')} />
          <Row k={t('leaveTabs.dayLeave')} v={t('leaveTabs.dayNoneVal')} />
          <p className="text-xs leading-snug text-neutral-500">{t('leaveTabs.dayMissedNote')}</p>
        </>
      )}
    </section>
  )
}

/** The app's one calendar cell: a 28px day circle (today ringed, picked filled), leave as a grey cell with its code, presence as a green dot. */
function DayCell({ cell, selected, onPick, t, language }: { cell: AttendanceCell; selected: boolean; onPick: () => void; t: Tr; language: 'en' | 'km' }) {
  const leave = cell.kind === 'leave' && cell.leaveType
  const muted = cell.kind === 'weekend' || cell.kind === 'future'
  const missed = cell.kind === 'none' && !cell.isToday
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={describe(cell, t, language)}
      aria-pressed={selected}
      className={`flex h-[50px] flex-col items-center justify-center gap-0.5 rounded-xl ${leave ? 'bg-neutral-100 dark:bg-neutral-800' : ''} ${cell.kind === 'holiday' ? 'bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(0_0_0/0.06)_3px_6px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(255_255_255/0.08)_3px_6px)]' : ''} ${missed ? 'bg-status-danger/10' : ''}`}
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
      ) : cell.kind === 'present' ? (
        <Check className="h-3 w-3 text-status-working" strokeWidth={3} aria-hidden />
      ) : missed ? (
        <span className="text-[9px] font-extrabold leading-none text-status-danger">A</span>
      ) : (
        <span className="h-3" />
      )}
    </button>
  )
}

function Legend({ swatch, label }: { swatch: 'dot' | 'leave' | 'missed' | 'holiday'; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch === 'dot' && <Check className="h-3 w-3 text-status-working" strokeWidth={3} aria-hidden />}
      {swatch === 'missed' && <span className="h-3 w-4 rounded bg-status-danger/10 ring-1 ring-inset ring-status-danger/30" />}
      {swatch === 'holiday' && <span className="h-3 w-4 rounded bg-[repeating-linear-gradient(135deg,transparent_0_2px,rgb(0_0_0/0.12)_2px_4px)] ring-1 ring-inset ring-neutral-200" />}
      {swatch === 'leave' && <span className="h-3 w-4 rounded bg-neutral-100 ring-1 ring-inset ring-neutral-200" />}
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
    case 'holiday':
      return t('leaveTabs.dayHolidayAria', { date, name: cell.holidayName ?? '' })
    case 'weekend':
      return t('leave.daySunday', { date })
    case 'future':
      return t('leave.dayUpcoming', { date })
    default:
      return t('leave.dayNone', { date })
  }
}
