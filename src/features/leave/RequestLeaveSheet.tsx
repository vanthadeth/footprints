import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { MonthCalendar } from '@/components/MonthCalendar'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveRequestDays } from './leaveMath'
import { formatLeaveDate } from './leaveDate'
import { todayDateString } from '@/lib/dateRange'
import { haptic } from '@/lib/haptic'
import { LEAVE_DAY_PERIOD_LABEL, type LeaveDayPeriod, type LeaveType } from './types'
import { cycleLabel, dayDate, days as fmtDays, leftAfter, rate, type FlexCycle } from '@/features/flex/flex'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', flex: 'Day off' }
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
      setError('End date must be on or after the start date.')
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
      <BottomSheet open={open} onClose={onClose} title="Request Leave">
        <div className="space-y-4 p-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Leave Type</p>
            <div className="flex gap-2">
              {types.map((t) => (
                <button
                  key={t}
                  onClick={() => setLeaveType(t)}
                  className={`flex-1 rounded-xl2 border py-2.5 text-sm font-semibold tap-target ${
                    leaveType === t ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  {LEAVE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <DateField label="Start Date" value={startDate} onOpen={() => setPickerFor('start')} />
              <PeriodSelect value={startPeriod} onChange={setStartPeriod} />
            </div>
            <div>
              <DateField label="End Date" value={endDate} onOpen={() => setPickerFor('end')} />
              <PeriodSelect value={endPeriod} onChange={setEndPeriod} />
            </div>
          </div>

          {leaveType === 'flex' && flex && <FlexBreakdown cycle={flex} request={days} />}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{leaveType === 'flex' ? 'Note for your manager (optional)' : 'Reason (optional)'}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Anything worth noting about this leave…"
              className="w-full rounded-xl2 border border-neutral-200 p-3 text-sm text-neutral-800 outline-none focus:border-brand-400"
            />
          </div>

          <p className="text-sm text-neutral-500">
            Total:{' '}
            <span className="font-semibold text-neutral-900">
              {workingDays === 0 ? 'No working days — all days off or holidays' : days > 0 ? `${days} working day${days === 1 ? '' : 's'}` : '—'}
            </span>
          </p>

          {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || days <= 0}
            className="w-full rounded-xl2 bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : leaveType === 'flex' ? 'Send for approval' : 'Submit Request'}
          </button>
          {leaveType === 'flex' && <p className="text-center text-xs text-neutral-500">Days you don’t clock in without a request also use your allowance automatically.</p>}
        </div>
      </BottomSheet>

      <BottomSheet open={pickerFor != null} onClose={() => setPickerFor(null)} title={pickerFor === 'start' ? 'Start Date' : 'End Date'}>
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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LeaveDayPeriod)}
      className="mt-1.5 w-full rounded-xl2 border border-neutral-200 bg-white p-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-brand-400"
    >
      {DAY_PERIODS.map((p) => (
        <option key={p} value={p}>
          {LEAVE_DAY_PERIOD_LABEL[p]}
        </option>
      ))}
    </select>
  )
}

/** This cycle's allowance, what's already used and what this request leaves -- over the allowance is allowed, with a warning. */
function FlexBreakdown({ cycle, request }: { cycle: FlexCycle; request: number }) {
  const after = leftAfter(cycle, request)
  const lines: [string, string, string][] = [
    [`Allowance (${cycle.saturdays} Sat × ${rate(cycle.satRate)} + ${cycle.sundays} Sun × ${rate(cycle.sunRate)})`, fmtDays(cycle.allowance), 'text-neutral-900'],
    ['Already taken or planned', `−${fmtDays(cycle.taken + cycle.planned)}`, 'text-status-visiting'],
    ['This request', `−${fmtDays(request)}`, 'text-status-visiting'],
  ]
  return (
    <div className="space-y-2">
      <div className="rounded-xl2 bg-neutral-50 p-3 dark:bg-neutral-900">
        <p className="mb-2 text-xs font-bold text-neutral-500">
          Cycle {cycleLabel(cycle)} · settles {dayDate(cycle.cycleEnd)}
        </p>
        {lines.map(([label, value, tone]) => (
          <p key={label} className="flex justify-between gap-3 py-0.5 text-[13.5px]">
            <span className="text-neutral-600">{label}</span>
            <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
          </p>
        ))}
        <p className="mt-1.5 flex justify-between gap-3 border-t border-neutral-200 pt-2 text-[14px] dark:border-neutral-700">
          <span className="font-semibold text-neutral-800">{after < 0 ? 'Over the allowance' : 'Left after this'}</span>
          <span className={`font-extrabold tabular-nums ${after < 0 ? 'text-status-danger' : 'text-status-working'}`}>{after < 0 ? `+${fmtDays(-after)}` : fmtDays(after)}</span>
        </p>
      </div>
      {after < 0 && (
        <p role="alert" className="rounded-xl2 bg-status-warn/10 px-3 py-2.5 text-[13px] leading-snug text-status-warn">
          This goes {fmtDays(-after)} day{-after === 1 ? '' : 's'} over your allowance. You can still send it — unless you work more weekends before {dayDate(cycle.cycleEnd)}, the extra will come from your annual leave.
        </p>
      )}
    </div>
  )
}
