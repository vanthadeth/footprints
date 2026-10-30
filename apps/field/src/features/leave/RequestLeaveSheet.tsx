import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { MonthCalendar } from '@/components/MonthCalendar'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveRequestDays } from './leaveMath'
import { formatLeaveDate } from './leaveDate'
import { todayDateString } from '@/lib/dateRange'
import { haptic } from '@footprints/shared/lib/haptic'
import type { LeaveDayPeriod, LeaveType } from './types'
import { leaveTypeName, periodName } from './leaveText'
import { cycleLabel, dayDate, days as fmtDays, leftAfter, rate, type FlexCycle } from '@/features/flex/flex'

const DAY_PERIODS: LeaveDayPeriod[] = ['full', 'morning', 'afternoon']

export function RequestLeaveSheet({
  open,
  onClose,
  onSubmitted,
  flex = null,
}: {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
  /** The person's current cycle when they're on flexible days off: adds "Day off" (the default) with its allowance. */
  flex?: FlexCycle | null
}) {
  const { t } = useLanguage()
  const flexible = !!flex?.isFlexible
  const types: LeaveType[] = flexible ? ['flex', 'annual', 'sick', 'unpaid'] : ['annual', 'sick', 'unpaid']
  const [leaveType, setLeaveType] = useState<LeaveType>(flexible ? 'flex' : 'annual')
  useEffect(() => {
    if (open) setLeaveType((t) => (flexible ? (t === 'annual' ? 'flex' : t) : t === 'flex' ? 'annual' : t))
  }, [open, flexible])
  const [startDate, setStartDate] = useState(() => todayDateString())
  const [endDate, setEndDate] = useState(() => todayDateString())
  const [startPeriod, setStartPeriod] = useState<LeaveDayPeriod>('full')
  const [endPeriod, setEndPeriod] = useState<LeaveDayPeriod>('full')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null)

  // The server counts working days only (weekends/days off for the person's
  // team and public holidays skipped); the calendar-day count is just a
  // placeholder until that answer arrives or if it can't be fetched.
  const calendarDays = endDate >= startDate ? leaveRequestDays(startDate, endDate, startPeriod, endPeriod) : 0
  const [workingDays, setWorkingDays] = useState<number | null>(null)
  useEffect(() => {
    if (!open || endDate < startDate) return
    let cancelled = false
    setWorkingDays(null)
    const t = window.setTimeout(() => {
      leaveService
        .previewDays(startDate, endDate, startPeriod, endPeriod)
        .then((n) => !cancelled && setWorkingDays(n))
        .catch(() => {
          // Falls back to the calendar-day count.
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, startDate, endDate, startPeriod, endPeriod])
  const days = workingDays ?? calendarDays

  function reset() {
    setLeaveType(flexible ? 'flex' : 'annual')
    setStartDate(todayDateString())
    setEndDate(todayDateString())
    setStartPeriod('full')
    setEndPeriod('full')
    setReason('')
    setError(null)
  }

  async function submit() {
    if (endDate < startDate) {
      setError(t('leave.endBeforeStart'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await leaveService.requestLeave({
        leaveType,
        startDate,
        endDate,
        startPeriod,
        endPeriod,
        reason: reason.trim() || null,
      })
      haptic('light')
      reset()
      onSubmitted()
      onClose()
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={t('leave.sheetTitle')}>
        <div className="space-y-4 p-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('leave.leaveType')}</p>
            <div className="flex gap-2">
              {types.map((ty) => (
                <button
                  key={ty}
                  onClick={() => setLeaveType(ty)}
                  className={`flex-1 rounded-xl2 border py-2.5 text-sm font-semibold tap-target ${
                    leaveType === ty ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  {ty === 'flex' ? t('leave.typeDayOff') : leaveTypeName(ty, t)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <DateField label={t('leave.startDate')} value={startDate} onOpen={() => setPickerFor('start')} />
              <PeriodSelect value={startPeriod} onChange={setStartPeriod} />
            </div>
            <div>
              <DateField label={t('leave.endDate')} value={endDate} onOpen={() => setPickerFor('end')} />
              <PeriodSelect value={endPeriod} onChange={setEndPeriod} />
            </div>
          </div>

          {leaveType === 'flex' && flex && <FlexBreakdown cycle={flex} request={days} />}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{leaveType === 'flex' ? t('leave.noteForManager') : t('leave.reasonOptional')}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('leave.reasonPlaceholder')}
              className="w-full rounded-xl2 border border-neutral-200 p-3 text-sm text-neutral-800 outline-none focus:border-brand-400"
            />
          </div>

          <p className="text-sm text-neutral-500">
            {t('leave.total')}{' '}
            <span className="font-semibold text-neutral-900">
              {workingDays === 0 ? t('leave.noWorkingDays') : days > 0 ? t(days === 1 ? 'leave.workingDayOne' : 'leave.workingDayMany', { n: days }) : '—'}
            </span>
          </p>

          {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || days <= 0}
            className="w-full rounded-xl2 bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            {submitting ? t('leave.submitting') : leaveType === 'flex' ? t('leave.sendApproval') : t('leave.submitRequest')}
          </button>
          {leaveType === 'flex' && <p className="text-center text-xs text-neutral-500">{t('leave.flexNote')}</p>}
        </div>
      </BottomSheet>

      <BottomSheet open={pickerFor != null} onClose={() => setPickerFor(null)} title={pickerFor === 'start' ? t('leave.startDate') : t('leave.endDate')}>
        <div className="p-4">
          <MonthCalendar
            value={pickerFor === 'start' ? startDate : endDate}
            onSelect={(date) => {
              if (pickerFor === 'start') setStartDate(date)
              else setEndDate(date)
              setPickerFor(null)
            }}
          />
        </div>
      </BottomSheet>
    </>
  )
}

function DateField({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="rounded-xl2 border border-neutral-200 p-3 text-left tap-target">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        <Calendar className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 text-sm font-medium text-neutral-900">{formatLeaveDate(value)}</p>
    </button>
  )
}

function PeriodSelect({ value, onChange }: { value: LeaveDayPeriod; onChange: (v: LeaveDayPeriod) => void }) {
  const { t } = useLanguage()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LeaveDayPeriod)}
      className="mt-1.5 w-full rounded-xl2 border border-neutral-200 bg-white p-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-brand-400"
    >
      {DAY_PERIODS.map((p) => (
        <option key={p} value={p}>
          {periodName(p, t)}
        </option>
      ))}
    </select>
  )
}

/** This cycle's allowance, what's already used and what this request leaves -- over the allowance is allowed, with a warning. */
function FlexBreakdown({ cycle, request }: { cycle: FlexCycle; request: number }) {
  const { t, language } = useLanguage()
  const after = leftAfter(cycle, request)
  const lines: [string, string, string][] = [
    [t('leave.allowanceLine', { sat: cycle.saturdays, satRate: rate(cycle.satRate), sun: cycle.sundays, sunRate: rate(cycle.sunRate) }), fmtDays(cycle.allowance), 'text-neutral-900'],
    [t('leave.alreadyTaken'), `−${fmtDays(cycle.taken + cycle.planned)}`, 'text-status-visiting'],
    [t('leave.thisRequest'), `−${fmtDays(request)}`, 'text-status-visiting'],
  ]
  return (
    <div className="space-y-2">
      <div className="rounded-xl2 bg-neutral-50 p-3 dark:bg-neutral-900">
        <p className="mb-2 text-xs font-bold text-neutral-500">
          {t('leave.cycleSettles', { cycle: cycleLabel(cycle, language), date: dayDate(cycle.cycleEnd, language) })}
        </p>
        {lines.map(([label, value, tone]) => (
          <p key={label} className="flex justify-between gap-3 py-0.5 text-[13.5px]">
            <span className="text-neutral-600">{label}</span>
            <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
          </p>
        ))}
        <p className="mt-1.5 flex justify-between gap-3 border-t border-neutral-200 pt-2 text-[14px] dark:border-neutral-700">
          <span className="font-semibold text-neutral-800">{after < 0 ? t('leave.overAllowance') : t('leave.leftAfterThis')}</span>
          <span className={`font-extrabold tabular-nums ${after < 0 ? 'text-status-danger' : 'text-status-working'}`}>{after < 0 ? `+${fmtDays(-after)}` : fmtDays(after)}</span>
        </p>
      </div>
      {after < 0 && (
        <p role="alert" className="rounded-xl2 bg-status-warn/10 px-3 py-2.5 text-[13px] leading-snug text-status-warn">
          {t(-after === 1 ? 'leave.overWarnOne' : 'leave.overWarnMany', { n: fmtDays(-after), date: dayDate(cycle.cycleEnd, language) })}
        </p>
      )}
    </div>
  )
}
