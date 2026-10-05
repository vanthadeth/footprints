import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react'
import { todayDateString } from '@/lib/dateRange'
import { RequestLeaveSheet } from '@/features/leave/RequestLeaveSheet'
import { flexService } from '@/features/flex/flexService'
import { addDays, cellLabel, cellTag, cycleCells, cycleLabel, cycleStatus, dayDate, days, over, rate, usedRows, type FlexCycle, type FlexDay } from '@/features/flex/flex'

const TONE = {
  ok: 'bg-status-working/10 text-status-working dark:text-emerald-300',
  warn: 'bg-status-warn/10 text-status-warn',
  danger: 'bg-status-danger/10 text-status-danger',
  muted: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800',
} as const

/** A day's cell in the cycle calendar, as on the Days off board. */
const CELL: Record<FlexDay['kind'], string> = {
  worked: 'bg-status-working/10',
  flex: 'bg-status-visiting/10',
  auto: 'bg-status-visiting/10 border-[1.5px] border-dashed border-status-visiting',
  pend: 'border-[1.5px] border-dashed border-status-visiting',
  holiday: 'holiday-stripes',
  leave: 'bg-brand-50 dark:bg-brand-500/15',
  upcoming: 'border border-neutral-200 dark:border-neutral-800',
}
const TAG: Record<FlexDay['kind'], string> = {
  worked: 'text-status-working dark:text-emerald-300',
  flex: 'text-status-visiting dark:text-violet-300',
  auto: 'text-status-visiting dark:text-violet-300',
  pend: 'text-status-visiting dark:text-violet-300',
  holiday: 'text-earth-500',
  leave: 'text-brand-600 dark:text-brand-300',
  upcoming: 'text-neutral-400',
}

/**
 * Leave › Days off: a person on flexible (travel) days off sees this cycle's
 * allowance (Saturdays × ½ + Sundays × 1, usable from day one), what's taken
 * and planned, a calendar of the cycle, and past cycles with how they settled.
 */
export function DaysOffPage() {
  const [params, setParams] = useSearchParams()
  const today = todayDateString()
  const date = params.get('d') ?? today
  // A manager/HR opening someone else's days off (from Flexible days off): read-only.
  const userId = params.get('user')
  const [personName, setPersonName] = useState<string | null>(null)
  const [cycle, setCycle] = useState<FlexCycle | null>(null)
  const [list, setList] = useState<FlexDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    flexService
      .cycle(userId, date)
      .then(async (c) => {
        const d = c ? await flexService.days(userId, c.cycleStart, c.cycleEnd) : []
        if (cancelled) return
        setCycle(c)
        setList(d)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load your days off.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [date, userId, nonce])

  useEffect(() => {
    if (!userId) return setPersonName(null)
    let cancelled = false
    flexService
      .team(date)
      .then((rows) => !cancelled && setPersonName(rows.find((r) => r.userId === userId)?.name ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, date])

  const isCurrent = !!cycle && cycle.cycleStart <= today && today <= cycle.cycleEnd
  const go = (d: string | null) => setParams({ ...(d ? { d } : {}), ...(userId ? { user: userId } : {}) }, { replace: true })

  if (loading && !cycle) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-3">
        <div className="h-12 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-72 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }
  if (error || !cycle) return <p className="mx-auto max-w-lg px-4 pt-4 text-sm text-status-danger">{error ?? 'Couldn’t load your days off.'}</p>

  const o = over(cycle)
  const status = cycleStatus(cycle)
  const done = cycle.settled || cycle.closed
  const pct = (x: number) => `${cycle.allowance ? Math.min(100, Math.round((x / cycle.allowance) * 100)) : 0}%`
  const rows = usedRows(list)

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-3 md:max-w-2xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(addDays(cycle.cycleStart, -1))} aria-label="Previous cycle" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 dark:border-neutral-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[16px] font-extrabold text-neutral-900">{cycleLabel(cycle)}</p>
            <p className="text-[12.5px] text-neutral-500">{done ? `${cycle.settled ? 'Settled' : 'Closed'} on ${dayDate(cycle.cycleEnd)}` : `${isCurrent ? 'This cycle' : 'Next cycle'} · settles ${dayDate(cycle.cycleEnd)}`}</p>
          </div>
          <button
            type="button"
            onClick={() => go(isCurrent ? null : addDays(cycle.cycleEnd, 1) > today ? null : addDays(cycle.cycleEnd, 1))}
            disabled={isCurrent || cycle.cycleStart > today}
            aria-label="Next cycle"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {userId && (
          <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            Viewing {personName ?? 'their'}{personName ? '’s' : ''} days off. Only they can request days off here.
          </p>
        )}

        {!cycle.isFlexible ? (
          <div className="rounded-2xl bg-white p-4 text-[14px] text-neutral-600 shadow-card">
            <p className="font-bold text-neutral-900">Company schedule this cycle</p>
            <p className="mt-1">{userId ? 'They follow' : 'You follow'} the company’s working days, so weekends are days off and there’s no flexible allowance for {cycleLabel(cycle)}.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold text-neutral-500">{done ? 'Not used (not carried over)' : o ? 'Over the allowance' : 'Days off left'}</p>
                  <p className="mt-0.5">
                    <span className={`text-[34px] font-extrabold leading-none ${o && !done ? 'text-status-danger' : 'text-neutral-900'}`}>{done ? days(cycle.unusedDays) : o ? `+${days(o)}` : days(cycle.left)}</span>
                    <span className="ml-1.5 text-[14px] font-semibold text-neutral-500">of {days(cycle.allowance)} days</span>
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${TONE[status.tone]}`}>{status.label}</span>
              </div>
              <div aria-hidden className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <span className="bg-status-visiting" style={{ width: pct(cycle.taken) }} />
                <span className="bg-status-visiting/35 dark:bg-violet-300/50" style={{ width: pct(Math.max(0, Math.min(cycle.planned, cycle.allowance - cycle.taken))) }} />
              </div>
              <div className="mt-2 flex gap-4 text-[12.5px] font-semibold text-neutral-600">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-visiting" />Taken {days(cycle.taken)}</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-visiting/35 dark:bg-violet-300/50" />Planned {days(cycle.planned)}</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-neutral-200 dark:bg-neutral-700" />Left {days(Math.max(0, cycle.left))}</span>
              </div>
              <p className="mt-3 border-t border-neutral-100 pt-3 text-[12.5px] leading-snug text-neutral-500 dark:border-neutral-800">
                {cycle.saturdays} Saturdays × {rate(cycle.satRate)} + {cycle.sundays} Sundays × {rate(cycle.sunRate)} = <span className="font-bold text-neutral-800">{days(cycle.allowance)} days</span> this cycle, all usable from day one. Holidays are off and don’t count.
              </p>
            </div>

            {(o > 0 || done) && (
              <div role="status" className={`flex gap-2.5 rounded-2xl p-3.5 text-[13px] leading-snug ${o > 0 && !done ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'}`}>
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  {done
                    ? `This cycle is ${cycle.settled ? 'settled' : 'closed'}: ${days(cycle.taken)} of ${days(cycle.allowance)} days used, ${days(cycle.unusedDays)} not carried over${cycle.overDays ? `, ${days(cycle.overDays)} over the allowance` : ''}.`
                    : `You’ve planned ${days(o)} day${o === 1 ? '' : 's'} more than this cycle’s allowance. Unless you work more weekends, ${o === 1 ? 'it' : 'they'} will come from your annual leave on ${dayDate(cycle.cycleEnd)}.`}
                </p>
              </div>
            )}

            {done ? (
              <Link to={`/leave/days-off/settlement?end=${cycle.cycleEnd}${userId ? `&user=${userId}` : ''}`} className="flex h-[50px] items-center justify-center rounded-2xl border-[1.5px] border-neutral-200 bg-white text-[15px] font-bold text-brand-600 dark:border-neutral-800">
                See settlement
              </Link>
            ) : userId ? null : (
              <button type="button" onClick={() => setRequestOpen(true)} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white">
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} /> Request day off
              </button>
            )}

            <div className="rounded-2xl bg-white p-3 shadow-card">
              <div className="mb-1.5 grid grid-cols-7 gap-1">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-center text-[11px] font-extrabold text-neutral-500">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cycleCells(list).map((d, i) =>
                  d ? (
                    <span
                      key={d.day}
                      aria-label={`${dayDate(d.day)}: ${cellLabel(d)}`}
                      className={`relative flex h-[46px] flex-col items-center justify-center rounded-lg ${CELL[d.kind]} ${d.day === today ? 'ring-2 ring-neutral-900 dark:ring-neutral-100' : ''}`}
                    >
                      <span className={`text-[13px] font-bold ${d.kind === 'upcoming' ? 'text-neutral-400' : 'text-neutral-900'}`}>{Number(d.day.slice(8))}</span>
                      <span className={`text-[9.5px] font-extrabold ${TAG[d.kind]}`}>{cellTag(d)}</span>
                      {d.kind === 'worked' && d.weekday >= 6 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-status-working" />}
                    </span>
                  ) : (
                    <span key={`pad-${i}`} />
                  ),
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] font-semibold text-neutral-600">
                <Legend className="bg-status-working/10" label="Worked" />
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-working" />Weekend worked</span>
                <Legend className="bg-status-visiting/10" label="Day off" />
                <Legend className="border-[1.5px] border-dashed border-status-visiting" label="Planned / no clock-in" />
                <Legend className="holiday-stripes" label="Holiday" />
              </div>
            </div>

            <div className="rounded-2xl bg-white px-4 py-3 shadow-card">
              <p className="mb-1 text-[13px] font-extrabold text-neutral-900">Days off this cycle</p>
              {rows.length === 0 && <p className="py-2 text-[13px] text-neutral-500">None yet.</p>}
              {rows.map((r) => (
                <div key={r.day} className="flex items-center justify-between gap-3 border-t border-neutral-100 py-2.5 first:border-t-0 dark:border-neutral-800">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-neutral-900">{r.day}</span>
                    <span className="block text-[12px] text-neutral-500">{r.note}</span>
                  </span>
                  <span className={`text-[14px] font-extrabold tabular-nums ${r.pending ? 'text-neutral-400' : 'text-status-visiting dark:text-violet-300'}`}>{r.amount}</span>
                </div>
              ))}
            </div>

            <p className="px-1 text-[12px] leading-snug text-neutral-500">
              Settles on the {ordinal(cycle.closeDay)}: days you don’t use aren’t carried over, and days taken beyond the allowance come from annual leave.
            </p>
          </>
        )}
      </div>

      {isCurrent && cycle.isFlexible && !userId && (
        <RequestLeaveSheet
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          flex={cycle}
          onSubmitted={reload}
        />
      )}
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  )
}

function ordinal(n: number): string {
  if (n === 0) return 'last day of the month'
  const s = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${s}`
}
