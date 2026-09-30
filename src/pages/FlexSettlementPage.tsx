import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'
import { displayName } from '@/lib/displayName'
import { flexService } from '@/features/flex/flexService'
import { addDays, cycleLabel, dayDate, days, rate, usedRows, type FlexCycle, type FlexDay } from '@/features/flex/flex'

/**
 * Leave › Days off › Settlement: how a closed cycle of flexible days off
 * settled -- the allowance earned, days requested and days with no
 * clock-in, then either the days not used (not carried over) or the days
 * over the allowance taken from annual leave.
 */
export function FlexSettlementPage() {
  const [params] = useSearchParams()
  const end = params.get('end')
  const userId = params.get('user')
  const { profile } = useProfile()
  const [personName, setPersonName] = useState<string | null>(null)
  const [cycle, setCycle] = useState<FlexCycle | null>(null)
  const [list, setList] = useState<FlexDay[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    flexService
      .cycle(userId, end)
      .then(async (c) => {
        const d = c ? await flexService.days(userId, c.cycleStart, c.cycleEnd) : []
        if (cancelled) return
        setCycle(c)
        setList(d)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load this cycle.'))
    return () => {
      cancelled = true
    }
  }, [end, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    flexService
      .team(end)
      .then((rows) => !cancelled && setPersonName(rows.find((r) => r.userId === userId)?.name ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, end])

  if (error) return <p className="mx-auto max-w-lg px-4 pt-4 text-sm text-status-danger">{error}</p>
  if (!cycle) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-3">
        <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }

  const requested = cycle.settled ? cycle.requested : cycle.requested + cycle.planned
  const overdrawn = cycle.overDays > 0
  const annualTaken = cycle.annualDays ?? cycle.overDays
  const unpaid = cycle.unpaidDays ?? 0
  const name = userId ? (personName ?? '') : profile ? displayName(profile.full_name, profile.nickname) : ''
  const lines: { label: string; sub?: string; value: string; tone: string; strong?: boolean }[] = [
    { label: 'Allowance earned', sub: `${cycle.saturdays} Saturdays × ${rate(cycle.satRate)} + ${cycle.sundays} Sundays × ${rate(cycle.sunRate)}`, value: days(cycle.allowance), tone: 'text-neutral-900', strong: true },
    { label: 'Requested days off', value: `−${days(requested)}`, tone: 'text-status-visiting dark:text-violet-300' },
    { label: 'Days with no clock-in', sub: 'used automatically', value: `−${days(cycle.autoDays)}`, tone: 'text-status-visiting dark:text-violet-300' },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3 md:max-w-2xl">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[14px] font-extrabold text-white">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-neutral-900">{name}</p>
          <p className="text-[12.5px] text-neutral-500">Flexible days off</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${cycle.settled ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' : 'bg-status-warn/10 text-status-warn'}`}>{cycle.settled ? 'Settled' : 'Not settled yet'}</span>
      </div>

      <div className="rounded-2xl bg-white px-4 py-3 shadow-card">
        <p className="mb-2 text-[13px] font-extrabold text-neutral-900">Cycle {cycleLabel(cycle)}</p>
        {lines.map((l) => (
          <div key={l.label} className="flex items-start justify-between gap-3 py-1.5">
            <span>
              <span className="block text-[14px] text-neutral-700">{l.label}</span>
              {l.sub && <span className="block text-[12px] text-neutral-500">{l.sub}</span>}
            </span>
            <span className={`text-[15px] tabular-nums ${l.strong ? 'font-bold' : 'font-semibold'} ${l.tone}`}>{l.value}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-neutral-100 pt-2.5 dark:border-neutral-800">
          <span className="text-[14px] font-semibold text-neutral-900">{overdrawn ? 'Taken beyond the allowance' : 'Left at the close'}</span>
          <span className={`text-[16px] font-extrabold tabular-nums ${overdrawn ? 'text-status-danger' : 'text-status-working dark:text-emerald-300'}`}>{overdrawn ? days(cycle.overDays) : days(cycle.unusedDays)}</span>
        </div>
      </div>

      <div className={`rounded-2xl p-4 ${overdrawn ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'}`}>
        <p className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">Result</p>
        <p className="mt-1 text-[17px] font-extrabold">
          {overdrawn ? `${days(annualTaken)} day${annualTaken === 1 ? '' : 's'} ${cycle.settled ? 'taken' : 'to be taken'} from annual leave` : `${days(cycle.unusedDays)} day${cycle.unusedDays === 1 ? '' : 's'} not used`}
        </p>
        <p className="mt-1 text-[13px] leading-snug">
          {overdrawn
            ? unpaid > 0
              ? `Annual leave ran out, so ${days(unpaid)} day${unpaid === 1 ? '' : 's'} ${unpaid === 1 ? 'is' : 'are'} unpaid.`
              : 'Nothing unpaid — it would only be unpaid if annual leave ran out.'
            : `Unused days aren’t carried over — the next cycle starts with its own allowance.`}
        </p>
      </div>

      <div className="rounded-2xl bg-white px-4 py-3 shadow-card">
        <p className="mb-1 text-[13px] font-extrabold text-neutral-900">Days off in this cycle</p>
        {usedRows(list).map((r) => (
          <div key={r.day} className="flex items-center justify-between gap-3 border-t border-neutral-100 py-2.5 first:border-t-0 dark:border-neutral-800">
            <span>
              <span className="block text-[14px] font-semibold text-neutral-900">{r.day}</span>
              <span className="block text-[12px] text-neutral-500">{r.note}</span>
            </span>
            <span className="text-[14px] font-extrabold tabular-nums text-status-visiting dark:text-violet-300">{r.amount}</span>
          </div>
        ))}
      </div>

      <p className="px-1 text-[12px] leading-snug text-neutral-500">
        {cycle.settled
          ? `Settled automatically on ${dayDate(addDays(cycle.cycleEnd, 1))}, the day after the cycle closed. Team › Attendance shows the same numbers.`
          : `Settles automatically on ${dayDate(addDays(cycle.cycleEnd, 1))}, the day after the cycle closes. These numbers can still change until then.`}
      </p>
    </div>
  )
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '·'
  )
}
