import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { MonthCalendar } from '@/components/MonthCalendar'
import { leaveErrorMessage, leaveService } from './leaveService'
import { leaveRequestDays } from './leaveMath'
import { formatLeaveDate } from './leaveDate'
import { todayDateString } from '@/lib/dateRange'
import { haptic } from '@/lib/haptic'
import { LEAVE_DAY_PERIOD_LABEL, type LeaveDayPeriod, type LeaveType } from './types'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid' }
const DAY_PERIODS: LeaveDayPeriod[] = ['full', 'morning', 'afternoon']

export function RequestLeaveSheet({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [startDate, setStartDate] = useState(() => todayDateString())
  const [endDate, setEndDate] = useState(() => todayDateString())
  const [startPeriod, setStartPeriod] = useState<LeaveDayPeriod>('full')
  const [endPeriod, setEndPeriod] = useState<LeaveDayPeriod>('full')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null)

  const days = endDate >= startDate ? leaveRequestDays(startDate, endDate, startPeriod, endPeriod) : 0

  function reset() {
    setLeaveType('annual')
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
              {(['annual', 'sick', 'unpaid'] as const).map((t) => (
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

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Reason (optional)</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Anything worth noting about this leave…"
              className="w-full rounded-xl2 border border-neutral-200 p-3 text-sm text-neutral-800 outline-none focus:border-brand-400"
            />
          </div>

          <p className="text-sm text-neutral-500">
            Total: <span className="font-semibold text-neutral-900">{days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '—'}</span>
          </p>

          {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || days <= 0}
            className="w-full rounded-xl2 bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
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
