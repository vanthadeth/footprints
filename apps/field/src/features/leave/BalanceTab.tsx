import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, ChevronRight, Scale } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { monthName, dayMonth } from '@/features/customers/detail/dates'
import { flexService } from '@/features/flex/flexService'
import { useFlexProgress } from '@/features/flex/useFlexProgress'
import { counted } from '@/features/flex/progress'
import { cycleLabel, dayDate, days as fmtDays } from '@/features/flex/flex'
import { leaveService } from './leaveService'
import { leaveTypeName } from './leaveText'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import { buildLedger, ledgerDelta, type FlexSettlementRow, type LedgerEntry } from './leaveLedger'
import { leaveRequestDays } from './leaveMath'
import { LEAVE_TYPE_COLOR, type LeaveBalanceSummary, type LeaveRequest } from './types'

interface Props {
  userId: string
  requests: LeaveRequest[]
  canManage: boolean
  /** The year the page opened on. */
  year: number
}

const daysOf = (r: LeaveRequest) => (r.days != null ? Number(r.days) : leaveRequestDays(r.start_date, r.end_date, r.start_period, r.end_period))

/**
 * Leave › Balance, as on the canvas: a year switcher, the annual leave card
 * with Sick and Unpaid beside it, "how it adds up", and the year's history
 * (requests and the working-days shortfalls taken from annual leave).
 */
export function BalanceTab({ userId, requests, canManage, year: openYear }: Props) {
  const { t, language } = useLanguage()
  const [year, setYear] = useState(openYear)
  const [balances, setBalances] = useState<LeaveBalanceSummary[] | null>(null)
  const [settlements, setSettlements] = useState<FlexSettlementRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const flex = useFlexProgress()

  useEffect(() => {
    let cancelled = false
    setBalances(null)
    setError(null)
    Promise.all([leaveService.listBalances(year), flexService.settlements(userId, year).catch(() => [] as FlexSettlementRow[])])
      .then(([b, s]) => {
        if (cancelled) return
        setBalances(b.filter((x) => x.user_id === userId))
        setSettlements(s)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('leave.loadFailed')))
    return () => {
      cancelled = true
    }
  }, [year, userId, t])

  const ledger = useMemo(() => buildLedger(year, requests, settlements), [year, requests, settlements])
  const annual = balances?.find((b) => b.leave_type === 'annual')
  const sick = balances?.find((b) => b.leave_type === 'sick')
  const quota = annual?.quota_days ?? 0
  const used = annual?.used_days ?? 0
  const left = annual?.remaining_days ?? 0
  const shortAnnual = settlements.filter((s) => s.minDays != null).reduce((a, s) => a + s.annualDays, 0)
  const approvedLeave = Math.max(0, used - shortAnnual)
  const pending = requests.filter((r) => r.status === 'pending' && r.leave_type === 'annual' && r.start_date.startsWith(String(year))).reduce((a, r) => a + daysOf(r), 0)
  const unpaid = ledger.flatMap((m) => m.entries).reduce((a, e) => a + ledgerDelta(e).unpaid, 0)
  const empty = !!balances && !(quota > 0 || (sick?.quota_days ?? 0) > 0)
  const isCurrent = year === openYear
  const oneOrMany = (n: number) => t(n === 1 ? 'leaveTabs.dayOne' : 'leaveTabs.dayMany', { n: fmtDays(n) })
  const pct = (n: number) => (quota ? Math.min(100, (n / quota) * 100) : 0)

  const switcher = (
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => setYear(year - 1)} aria-label={t('leaveTabs.prevYear')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-700 shadow-card">
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="text-center">
        <p className="text-[16px] font-bold text-neutral-900">{year}</p>
        <p className="text-xs text-neutral-500">{t(isCurrent || year < openYear ? 'leaveTabs.resets' : 'leaveTabs.starts')}</p>
      </div>
      <button type="button" onClick={() => setYear(year + 1)} disabled={year >= openYear + 1} aria-label={t('leaveTabs.nextYear')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-700 shadow-card disabled:opacity-30">
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  )

  if (error) return <p className="text-sm text-status-danger">{error}</p>
  if (!balances) {
    return (
      <div className="space-y-3">
        {switcher}
        <div className="h-36 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }

  const hrLink = canManage && (
    <Link to="/leave/allowances" className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Scale className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">{t('leave.allowancesLink')}</span>
        <span className="block text-[12.5px] text-neutral-500">{t('leave.allowancesSub')}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
    </Link>
  )

  if (empty) {
    return (
      <div className="space-y-4">
        {switcher}
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Scale className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-[17px] font-bold text-neutral-900">{t('leaveTabs.emptyTitle', { year })}</p>
          <p className="text-[13.5px] leading-snug text-neutral-500">{t('leaveTabs.emptyBody')}</p>
        </div>
        {hrLink}
      </div>
    )
  }

  const rows: { title: string; sub: string; value: string; tone?: string }[] = [
    { title: t('leaveTabs.addAllowance'), sub: t('leaveTabs.addAllowanceSub', { year }), value: fmtDays(quota) },
    { title: t('leaveTabs.addUsed'), sub: t('leaveTabs.addUsedSub'), value: `−${fmtDays(approvedLeave)}` },
    ...(shortAnnual > 0 ? [{ title: t('leaveTabs.addShort'), sub: t('leaveTabs.addShortSub'), value: `−${fmtDays(shortAnnual)}`, tone: 'text-status-danger' }] : []),
    { title: t('leaveTabs.addWaiting'), sub: t('leaveTabs.addWaitingSub'), value: oneOrMany(pending), tone: 'text-neutral-500' },
  ]

  return (
    <div className="space-y-4">
      {switcher}

      <div className="grid grid-cols-[1.15fr_1fr] gap-2">
        <div className="row-span-2 flex flex-col rounded-2xl bg-white p-3.5 shadow-card">
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-neutral-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LEAVE_TYPE_COLOR.annual }} />
            {leaveTypeName('annual', t)}
          </span>
          <span className="mt-1.5 text-[46px] font-extrabold leading-[50px] tracking-tight text-neutral-900">{fmtDays(left)}</span>
          <span className="text-[12.5px] text-neutral-500">{t('leaveTabs.leftOf', { n: fmtDays(quota) })}</span>
          <span className="my-3 flex h-[7px] gap-0.5 overflow-hidden rounded-full bg-neutral-100">
            <span style={{ width: `${pct(used)}%`, backgroundColor: LEAVE_TYPE_COLOR.annual }} />
            <span style={{ width: `${pct(pending)}%`, backgroundColor: LEAVE_TYPE_COLOR.unpaid }} />
          </span>
          <span className="text-xs text-neutral-500">{t('leaveTabs.usedWaiting', { used: fmtDays(used), pending: fmtDays(pending) })}</span>
        </div>
        {([
          ['sick', fmtDays(sick?.remaining_days ?? 0), t('leaveTabs.sickOf', { n: fmtDays(sick?.quota_days ?? 0) })],
          ['unpaid', fmtDays(unpaid), t('leaveTabs.taken')],
        ] as const).map(([type, big, sub]) => (
          <div key={type} className="flex flex-col rounded-2xl bg-white p-3.5 shadow-card">
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-neutral-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LEAVE_TYPE_COLOR[type] }} />
              {leaveTypeName(type, t)}
            </span>
            <span className="mt-0.5 text-[30px] font-extrabold leading-[34px] tracking-tight text-neutral-900">{big}</span>
            <span className="text-[12.5px] text-neutral-500">{sub}</span>
          </div>
        ))}
      </div>

      {flex.progress?.isFlexible && flex.progress.minDays != null && isCurrent && (
        <Link to="/leave/days-off" className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CalendarCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold text-neutral-900">{t('leaveTabs.wdLink', { have: fmtDays(counted(flex.progress)), min: flex.progress.minDays })}</span>
            <span className="block truncate text-xs text-neutral-500">{t('leaveTabs.wdLinkSub', { cycle: cycleLabel(flex.progress, language), date: dayDate(flex.progress.cycleEnd, language) })}</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>
      )}

      <section className="space-y-2">
        <h2 className="px-1 pt-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('leaveTabs.sectAdds')}</h2>
        <div className="rounded-2xl bg-white px-4 shadow-card">
          {rows.map((r) => (
            <div key={r.title} className="flex items-center justify-between gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-800">
              <span className="min-w-0">
                <span className="block text-[14.5px] font-bold text-neutral-900">{r.title}</span>
                <span className="block text-xs text-neutral-500">{r.sub}</span>
              </span>
              <span className={`whitespace-nowrap text-[16px] font-bold tabular-nums ${r.tone ?? 'text-neutral-900'}`}>{r.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t-2 border-neutral-900 py-3">
            <span className="text-[16px] font-bold text-neutral-900">{t('leaveTabs.addLeft')}</span>
            <span className="text-[22px] font-extrabold tabular-nums text-brand-500">{fmtDays(left)}</span>
          </div>
        </div>
        {shortAnnual > 0 && <p className="px-1 text-xs leading-snug text-neutral-500">{t('leaveTabs.shortNote')}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 pt-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('leaveTabs.sectHistory', { year })}</h2>
        {ledger.length === 0 && <p className="rounded-2xl bg-white p-5 text-center text-[13.5px] text-neutral-500 shadow-card">{t('leaveTabs.histNone', { year })}</p>}
        {ledger.map((m) => (
          <div key={m.key} className="space-y-1.5">
            <p className="px-1 pt-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{monthName(m.month - 1, language)}</p>
            <div className="rounded-2xl bg-white px-4 shadow-card">
              {m.entries.map((e) => (
                <LedgerRow key={e.id} e={e} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {hrLink}
    </div>
  )

  function LedgerRow({ e }: { e: LedgerEntry }) {
    const d = ledgerDelta(e)
    const took = d.annual + d.unpaid + d.sick
    const [, mo, dd] = e.date.split('-')
    return (
      <div className="flex gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-800">
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
          <span className="text-[17px] font-extrabold leading-5 text-neutral-900">{Number(dd)}</span>
          <span className="text-[10px] font-bold uppercase text-neutral-500">{monthName(Number(mo) - 1, language).slice(0, 3)}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-bold text-neutral-900">{e.kind === 'leave' ? leaveTypeName(e.type, t) : t('leaveTabs.entShort')}</span>
            <span className={`text-[16px] font-extrabold tabular-nums ${e.kind === 'short' ? 'text-status-danger' : took ? 'text-neutral-900' : 'text-neutral-400'}`}>{took ? `−${fmtDays(took)}` : '—'}</span>
          </span>
          <span className="text-[12.5px] text-neutral-500">
            {e.kind === 'leave'
              ? `${e.date === e.endDate ? dayMonth(e.date, language) : `${dayMonth(e.date, language)} – ${dayMonth(e.endDate, language)}`} · ${oneOrMany(e.days)}`
              : `${t('leaveTabs.entShortSub', { cycle: cycleLabel({ cycleStart: e.cycleStart, cycleEnd: e.cycleEnd }, language), have: fmtDays(e.have), min: e.min })}${e.annual > 0 ? t('leaveTabs.entShortAl') : ''}`}
          </span>
          <span className="mt-0.5 self-start">
            {e.kind === 'leave' ? <LeaveStatusBadge status={e.status} /> : <span className="inline-flex rounded-full bg-status-warn/10 px-2 py-0.5 text-[10px] font-medium text-status-warn">{t('leaveTabs.settled')}</span>}
          </span>
        </span>
      </div>
    )
  }
}
