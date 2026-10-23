import { useState } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Stepper } from '@/components/Stepper'
import { Switch } from '@/components/Switch'
import { DAY_NAMES, DAY_SHORT, commonHours, dayHours, formatHours, type DaySchedule } from './schedule'

type Mode = 'same' | 'per'

const breakLabel = (m: number) => (m === 0 ? 'None' : m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}` : `${m / 60} h`)

/**
 * Edits one schedule: which days are worked, their hours and breaks, and
 * whether the break is paid. "Same every day" edits every working day at
 * once; "Different per day" opens a sheet per day. Used for the company
 * schedule and for team schedules alike.
 */
export function ScheduleEditor({
  days,
  breakPaid,
  onChange,
  disabled,
}: {
  days: DaySchedule[]
  breakPaid: boolean
  onChange: (days: DaySchedule[], breakPaid: boolean) => void
  disabled?: boolean
}) {
  const [mode, setMode] = useState<Mode>(() => (commonHours(days) && sameBreak(days) ? 'same' : 'per'))
  const [openDay, setOpenDay] = useState<number | null>(null)
  const firstWorking = days.find((d) => d.isWorking) ?? days[0]

  const setDays = (next: DaySchedule[]) => onChange(next, breakPaid)
  const patchDay = (isoDow: number, patch: Partial<DaySchedule>) => setDays(days.map((d) => (d.isoDow === isoDow ? { ...d, ...patch } : d)))
  const patchAllWorking = (patch: Partial<DaySchedule>) => setDays(days.map((d) => ({ ...d, ...patch })))

  function toggleDay(d: DaySchedule) {
    // A day switched on in "same" mode picks up the common hours.
    patchDay(d.isoDow, mode === 'same' && !d.isWorking ? { isWorking: true, start: firstWorking.start, end: firstWorking.end, breakMinutes: firstWorking.breakMinutes } : { isWorking: !d.isWorking })
  }

  function switchMode(next: Mode) {
    if (next === 'same') patchAllWorking({ start: firstWorking.start, end: firstWorking.end, breakMinutes: firstWorking.breakMinutes })
    setMode(next)
  }

  const sel = openDay !== null ? days.find((d) => d.isoDow === openDay) ?? null : null

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 px-0.5 text-[15px] font-bold text-neutral-900">Working days</p>
        <div role="group" aria-label="Working days" className="grid grid-cols-7 gap-1.5">
          {days.map((d) => (
            <button
              key={d.isoDow}
              type="button"
              onClick={() => toggleDay(d)}
              disabled={disabled}
              aria-pressed={d.isWorking}
              aria-label={DAY_NAMES[d.isoDow - 1]}
              className={`flex h-12 flex-col items-center justify-center rounded-xl border-[1.5px] text-sm font-extrabold tap-target disabled:opacity-60 ${
                d.isWorking ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-500'
              }`}
            >
              {DAY_SHORT[d.isoDow - 1].slice(0, 1)}
              <span className="text-[9.5px] font-bold opacity-90">{d.isWorking ? formatHours(dayHours(d, breakPaid)) : 'Off'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <SegmentedControl<Mode>
          ariaLabel="Hours pattern"
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'same', label: 'Same every day' },
            { value: 'per', label: 'Different per day' },
          ]}
        />
        {mode === 'same' ? (
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <TimeRow label="Start" id="sched-start" value={firstWorking.start} disabled={disabled} onChange={(v) => patchAllWorking({ start: v })} />
            <TimeRow label="End" id="sched-end" value={firstWorking.end} disabled={disabled} onChange={(v) => patchAllWorking({ end: v })} />
            <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-neutral-900">Lunch break</p>
                <p className="text-xs text-neutral-500">{breakPaid ? 'Paid · counts as work time' : `Unpaid · ${formatHours(dayHours(firstWorking, false))} worked a day`}</p>
              </div>
              <Stepper label="Break" value={firstWorking.breakMinutes} step={15} max={240} format={breakLabel} disabled={disabled} onChange={(v) => patchAllWorking({ breakMinutes: v })} />
            </div>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
            {days.map((d, i) => (
              <li key={d.isoDow} className={i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                <button type="button" onClick={() => setOpenDay(d.isoDow)} disabled={disabled} className="flex w-full items-center gap-3 px-4 py-3 text-left tap-target">
                  <span className={`w-11 shrink-0 text-[15px] font-bold ${d.isWorking ? 'text-neutral-900' : 'text-neutral-400'}`}>{DAY_SHORT[d.isoDow - 1]}</span>
                  <span className={`min-w-0 flex-1 text-sm tabular-nums ${d.isWorking ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    {d.isWorking ? `${d.start} – ${d.end}${d.breakMinutes ? ` · ${breakLabel(d.breakMinutes)} break` : ''}` : 'Day off'}
                  </span>
                  {d.isWorking && <span className="shrink-0 text-[13px] font-extrabold text-neutral-900">{formatHours(dayHours(d, breakPaid))}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3 px-0.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-neutral-900">Break is paid</p>
            <p className="text-xs text-neutral-500">Off: the break doesn’t count towards hours worked</p>
          </div>
          <Switch label="Break is paid" checked={breakPaid} disabled={disabled} onChange={(v) => onChange(days, v)} />
        </div>
      </div>

      <BottomSheet open={sel !== null} onClose={() => setOpenDay(null)} title={sel ? DAY_NAMES[sel.isoDow - 1] : ''}>
        {sel && (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-neutral-900">Working day</p>
                <p className="text-xs text-neutral-500">{sel.isWorking ? `${formatHours(dayHours(sel, breakPaid))} worked` : 'Day off · never counted as absent'}</p>
              </div>
              <Switch label={`${DAY_NAMES[sel.isoDow - 1]} is a working day`} checked={sel.isWorking} onChange={(v) => patchDay(sel.isoDow, { isWorking: v })} />
            </div>
            {sel.isWorking && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-[13px] font-bold text-neutral-600">
                    <span>Start</span>
                    <input type="time" value={sel.start} onChange={(e) => patchDay(sel.isoDow, { start: e.target.value })} className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] font-bold text-neutral-900" />
                  </label>
                  <label className="space-y-1.5 text-[13px] font-bold text-neutral-600">
                    <span>End</span>
                    <input type="time" value={sel.end} onChange={(e) => patchDay(sel.isoDow, { end: e.target.value })} className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] font-bold text-neutral-900" />
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-[15px] font-semibold text-neutral-900">Break</span>
                  <Stepper label="Break" value={sel.breakMinutes} step={15} max={240} format={breakLabel} onChange={(v) => patchDay(sel.isoDow, { breakMinutes: v })} />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDays(days.map((d) => (d.isWorking ? { ...d, start: sel.start, end: sel.end, breakMinutes: sel.breakMinutes } : d)))
                  setOpenDay(null)
                }}
                className="flex h-12 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-neutral-200 text-sm font-bold text-neutral-600 tap-target"
              >
                <Copy className="h-4 w-4" /> Copy to all days
              </button>
              <button type="button" onClick={() => setOpenDay(null)} className="h-12 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target">
                Done
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

function sameBreak(days: DaySchedule[]): boolean {
  const on = days.filter((d) => d.isWorking)
  return on.every((d) => d.breakMinutes === on[0]?.breakMinutes)
}

function TimeRow({ label, id, value, onChange, disabled }: { label: string; id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3 first:border-t-0 dark:border-neutral-800">
      <label htmlFor={id} className="flex-1 text-[15px] font-semibold text-neutral-900">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-10 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2.5 text-[15px] font-bold text-neutral-900"
      />
    </div>
  )
}
