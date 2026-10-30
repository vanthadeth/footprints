import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { todayDateString } from '@/lib/dateRange'
import { BottomSheet } from '@/components/BottomSheet'
import { flexService } from '@/features/flex/flexService'
import { leaveService } from '@/features/leave/leaveService'
import { addDays, cycleLabel, dayDate, days } from '@/features/flex/flex'
import { counted, pickableDays, progressCells, progressLabel, progressStatus, progressTag, whatIf, type FlexProgress, type ProgressDay, type ProgressKind } from '@/features/flex/progress'

const TONE = {
  ok: 'bg-status-working/10 text-status-working',
  warn: 'bg-status-warn/10 text-status-warn',
  danger: 'bg-status-danger/10 text-status-danger',
  muted: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800',
} as const

/** A day's cell in the cycle calendar, as on the Working days board. */
const CELL: Record<ProgressKind, string> = {
  worked: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100',
  holiday: 'bg-status-working/10 text-status-working',
  leave: 'bg-status-working/10 text-status-working',
  pend: 'border-[1.5px] border-dashed border-status-warn text-status-warn',
  missing: 'bg-status-warn/10 text-status-warn',
  rest: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800',
  upcoming: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800',
}

type Tab = 'cycle' | 'worked'

/**
 * Leave › Working days: a person on flexible days off needs a minimum number
 * of working days each cycle (company default 20). Days with a clock-in,
 * approved leave and public holidays count. A cycle that ends short settles
 * the missing days as absent, from annual leave first, then unpaid. This page
 * shows the progress, a calendar, and a what-if for days you plan to take off.
 */
export function DaysOffPage() {
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const [params, setParams] = useSearchParams()
  const today = todayDateString()
  const date = params.get('d') ?? today
  // A manager/HR opening someone else's page (from Flexible days off): read-only.
  const userId = params.get('user')
  const [personName, setPersonName] = useState<string | null>(null)
  const [progress, setProgress] = useState<FlexProgress | null>(null)
  const [list, setList] = useState<ProgressDay[]>([])
  const [annualLeft, setAnnualLeft] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('cycle')
  const [planOpen, setPlanOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    flexService
      .progress(userId, date)
      .then(async (p) => {
        const d = p ? await flexService.progressDays(userId, p.cycleStart, p.cycleEnd) : []
        if (cancelled) return
        setProgress(p)
        setList(d)
        setPicked([])
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('workDays.loadFailed')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [date, userId, t])

  useEffect(() => {
    if (userId || !profile) return
    let cancelled = false
    leaveService
      .listBalances(new Date().getFullYear())
      .then((rows) => !cancelled && setAnnualLeft(rows.find((r) => r.user_id === profile.id && r.leave_type === 'annual')?.remaining_days ?? 0))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, profile])

  useEffect(() => {
    if (!userId) return setPersonName(null)
    let cancelled = false
    flexService
      .teamProgress(date)
      .then((rows) => !cancelled && setPersonName(rows.find((r) => r.userId === userId)?.name ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, date])

  const isCurrent = !!progress && progress.cycleStart <= today && today <= progress.cycleEnd
  const go = (d: string | null) => setParams({ ...(d ? { d } : {}), ...(userId ? { user: userId } : {}) }, { replace: true })
  const open = useMemo(() => pickableDays(list), [list])

  if (loading && !progress) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-3">
        <div className="h-12 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-72 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }
  if (error || !progress) return <p className="mx-auto max-w-lg px-4 pt-4 text-sm text-status-danger">{error ?? t('workDays.loadFailed')}</p>

  const done = progress.settled || progress.closed
  const min = progress.minDays ?? 0
  const total = counted(progress)
  const status = progressStatus(progress, t)
  const pct = (x: number) => `${min ? Math.min(100, Math.round((x / min) * 100)) : 0}%`
  const effect = whatIf(progress, picked.length, annualLeft)
  const label = cycleLabel(progress, language)

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-3 md:max-w-2xl lg:max-w-4xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(addDays(progress.cycleStart, -1))} aria-label={t('workDays.prevCycle')} className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 dark:border-neutral-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[16px] font-extrabold text-neutral-900">{label}</p>
            <p className="text-[12.5px] text-neutral-500">{done ? t(progress.settled ? 'workDays.settledOn' : 'workDays.closedOn', { date: dayDate(progress.cycleEnd, language) }) : t(isCurrent ? 'workDays.thisCycleSettles' : 'workDays.nextCycleSettles', { date: dayDate(addDays(progress.cycleEnd, 1), language) })}</p>
          </div>
          <button
            type="button"
            onClick={() => go(isCurrent ? null : addDays(progress.cycleEnd, 1) > today ? null : addDays(progress.cycleEnd, 1))}
            disabled={isCurrent || progress.cycleStart > today}
            aria-label={t('workDays.nextCycle')}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {userId && (
          <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {personName ? t('workDays.viewingPerson', { name: personName }) : t('workDays.viewingThem')}
          </p>
        )}

        {!progress.isFlexible ? (
          <div className="rounded-2xl bg-white p-4 text-[14px] text-neutral-600 shadow-card">
            <p className="font-bold text-neutral-900">{t('workDays.companyTitle')}</p>
            <p className="mt-1">{t(userId ? 'workDays.companyThey' : 'workDays.companyYou', { cycle: label })}</p>
          </div>
        ) : (
          <>
            <div role="tablist" aria-label={t('workDays.heroLabel')} className="flex gap-0.5 rounded-xl bg-neutral-100 p-[3px] lg:max-w-xl">
              {(['cycle', 'worked'] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-10 flex-1 rounded-[9px] text-[13.5px] ${tab === k ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}>
                  {t(k === 'cycle' ? 'workDays.tabCycle' : 'workDays.tabWorked')}
                </button>
              ))}
            </div>

            {tab === 'cycle' ? (
              <CycleTab
                progress={progress}
                list={list}
                total={total}
                min={min}
                pct={pct}
                status={status}
                done={done}
                today={today}
                label={label}
                userId={userId}
                canPlan={isCurrent && !userId && open.length > 0}
                onPlan={() => setPlanOpen(true)}
              />
            ) : (
              <WorkedTab list={list} today={today} progress={progress} />
            )}
          </>
        )}
      </div>

      <BottomSheet open={planOpen} onClose={() => setPlanOpen(false)} title={t('workDays.planTitle')}>
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[13px] leading-snug text-neutral-500">{t('workDays.planIntro', { n: min })}</p>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{t('workDays.planDays')}</p>
            {picked.length > 0 && (
              <button type="button" onClick={() => setPicked([])} className="text-[12.5px] font-bold text-brand-600">
                {t('workDays.planClear')}
              </button>
            )}
          </div>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {open.map((d) => {
              const on = picked.includes(d.day)
              return (
                <button key={d.day} type="button" aria-pressed={on} onClick={() => setPicked((v) => (on ? v.filter((x) => x !== d.day) : [...v, d.day]))} className={`inline-flex h-8 items-center rounded-full border-[1.5px] px-3 text-[13px] ${on ? 'border-brand-500 bg-brand-500 font-bold text-white' : 'border-neutral-300 font-semibold text-neutral-900 dark:border-neutral-600'}`}>
                  {dayDate(d.day, language)}
                </button>
              )
            })}
          </div>
          {picked.length === 0 && <p className="text-[12.5px] text-neutral-500">{t('workDays.planNone')}</p>}
          <div className="flex items-center justify-between gap-3 rounded-[14px] bg-neutral-100 px-3.5 py-3 dark:bg-neutral-800">
            <span className="min-w-0">
              <span className="block text-[16px] font-extrabold text-neutral-900">{effect.short > 0 ? t('workDays.planShort', { n: days(effect.short) }) : t('workDays.planReaches', { n: min })}</span>
              <span className="block text-[12px] text-neutral-500">{t('workDays.planNeedLine', { need: days(progress.stillNeeded), avail: days(progress.available - picked.length) })}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[12px] text-neutral-500">{t('workDays.planSpareLabel')}</span>
              <span className={`block whitespace-nowrap text-[20px] font-extrabold ${effect.spare < 0 ? 'text-status-danger' : 'text-neutral-900'}`}>{effect.spare < 0 ? `−${days(-effect.spare)}` : t('workDays.planSpareN', { n: days(effect.spare) })}</span>
            </span>
          </div>
          <p className={`flex gap-2 text-[12.5px] leading-snug ${effect.short > 0 ? 'text-status-danger' : 'text-neutral-500'}`}>
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {effect.short === 0
                ? t('workDays.planOk', { n: min, spare: days(Math.max(0, effect.spare)) })
                : effect.unpaid === 0
                  ? t('workDays.planAnnual', { n: days(effect.short), from: days(annualLeft), to: days(effect.annualAfter) })
                  : effect.annual === 0
                    ? t('workDays.planUnpaid', { n: days(effect.short) })
                    : t('workDays.planAnnualUnpaid', { n: days(effect.short), al: days(effect.annual), ul: days(effect.unpaid) })}
            </span>
          </p>
        </div>
      </BottomSheet>
    </div>
  )
}

function CycleTab({ progress, list, total, min, pct, status, done, today, label, userId, canPlan, onPlan }: {
  progress: FlexProgress
  list: ProgressDay[]
  total: number
  min: number
  pct: (x: number) => string
  status: { label: string; tone: keyof typeof TONE }
  done: boolean
  today: string
  label: string
  userId: string | null
  canPlan: boolean
  onPlan: () => void
}) {
  const { t, language } = useLanguage()
  const short = progress.spare < 0
  return (
    <>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-neutral-500">{t('workDays.heroLabel')}</p>
            <p className="mt-0.5">
              <span className="text-[52px] font-extrabold leading-[56px] tracking-tight text-neutral-900">{days(total)}</span>
              <span className="ml-1.5 text-[20px] font-semibold text-neutral-500">{t('workDays.heroOf', { n: min })}</span>
            </p>
            <p className="text-[12.5px] text-neutral-500">{t('workDays.heroSub', { worked: days(progress.worked), credited: days(progress.credited) })}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${TONE[status.tone]}`}>{status.label}</span>
        </div>
        <div aria-hidden className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <span className="bg-brand-500" style={{ width: pct(progress.worked) }} />
          <span className="bg-status-working" style={{ width: pct(progress.credited) }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-neutral-600">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" />{t('workDays.legBarWorked', { n: days(progress.worked) })}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-working" />{t('workDays.legBarCredited', { n: days(progress.credited) })}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-neutral-200 dark:bg-neutral-700" />{t('workDays.legBarNeeded', { n: days(progress.stillNeeded) })}</span>
        </div>
      </div>

      {!done && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white p-3.5 shadow-card">
            <p className="text-[12.5px] font-semibold text-neutral-500">{t('workDays.tileNeeded')}</p>
            <p className="text-[34px] font-extrabold leading-10 tracking-tight text-neutral-900">{days(progress.stillNeeded)}</p>
            <p className="text-[12px] text-neutral-500">{t('workDays.tileNeededSub', { n: min })}</p>
          </div>
          <div className="rounded-2xl bg-white p-3.5 shadow-card">
            <p className="text-[12.5px] font-semibold text-neutral-500">{short ? t('workDays.tileShort') : t('workDays.tileSpare')}</p>
            <p className={`text-[34px] font-extrabold leading-10 tracking-tight ${short ? 'text-status-danger' : 'text-neutral-900'}`}>{days(Math.abs(progress.spare))}</p>
            <p className="text-[12px] text-neutral-500">{short ? t('workDays.tileShortSub') : t('workDays.tileSpareSub', { n: days(progress.available) })}</p>
          </div>
        </div>
      )}

      <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{t('workDays.ruleTitle')}</p>
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-status-working/10 px-1 text-[20px] font-extrabold text-status-working">{min}</span>
          <span>
            <span className="block text-[15px] font-extrabold text-neutral-900">{t('workDays.ruleMin')}</span>
            <span className="block text-[12.5px] text-neutral-500">{t('workDays.ruleMinSub', { cycle: label })}</span>
          </span>
        </div>
        <p className="text-[12.5px] leading-snug text-neutral-500">{t('workDays.ruleBody')}</p>
      </div>

      <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{t('workDays.calendar')}</p>
      <div className="rounded-2xl bg-white p-3 shadow-card">
        <div className="mb-1.5 grid grid-cols-7 gap-1">
          {t('leave.wdInitials').split(',').map((d, i) => (
            <span key={i} className="text-center text-[11px] font-extrabold text-neutral-500">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {progressCells(list).map((d, i) =>
            d ? (
              <span key={d.day} aria-label={`${dayDate(d.day, language)}: ${progressLabel(d, t)}`} className={`flex h-[46px] flex-col items-center justify-center rounded-[10px] ${CELL[d.kind]} ${d.day === today ? 'ring-2 ring-neutral-900 dark:ring-neutral-100' : ''}`}>
                <span className="text-[13.5px] font-bold leading-4">{Number(d.day.slice(8))}</span>
                <span className="min-h-[11px] text-[9.5px] font-extrabold leading-[11px]">{progressTag(d, t)}</span>
              </span>
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] font-semibold text-neutral-600">
          <Legend className="bg-brand-50 dark:bg-brand-500/15" label={t('workDays.legWorked')} />
          <Legend className="bg-status-working/10" label={t('workDays.legLeave')} />
          <Legend className="bg-status-warn/10" label={t('workDays.legMissing')} />
          <Legend className="border-[1.5px] border-dashed border-status-warn" label={t('workDays.legWaiting')} />
        </div>
      </div>

      {done ? (
        <Link to={`/leave/days-off/settlement?end=${progress.cycleEnd}${userId ? `&user=${userId}` : ''}`} className="flex h-[50px] items-center justify-center rounded-2xl border-[1.5px] border-neutral-200 bg-white text-[15px] font-bold text-brand-600 dark:border-neutral-800">
          {t('workDays.seeSettlement')}
        </Link>
      ) : (
        canPlan && (
          <button type="button" onClick={onPlan} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[16px] font-bold text-white">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} /> {t('workDays.planCta')}
          </button>
        )
      )}

      <p className="px-1 text-[12px] leading-snug text-neutral-500">{t('workDays.settlesNote', { date: dayDate(addDays(progress.cycleEnd, 1), language) })}</p>
    </>
  )
}

function WorkedTab({ list, today, progress }: { list: ProgressDay[]; today: string; progress: FlexProgress }) {
  const { t, language } = useLanguage()
  const worked = list.filter((d) => d.kind === 'worked').reverse()
  const notWorked = list.filter((d) => (d.kind === 'missing' || d.kind === 'rest') && d.day < today).reverse()
  const credited = list.filter((d) => d.kind === 'holiday' || d.kind === 'leave')
  const row = (d: ProgressDay, note: string, tag: string, tone: string) => (
    <div key={d.day} className="flex items-center justify-between gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-800">
      <span className="min-w-0">
        <span className="block text-[14.5px] font-extrabold text-neutral-900">{dayDate(d.day, language)}</span>
        {note && <span className="block text-[12.5px] text-neutral-500">{note}</span>}
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${tone}`}>{tag}</span>
    </div>
  )
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <p className="text-[12.5px] font-semibold text-neutral-500">{t('workDays.workedStat')}</p>
          <p className="text-[34px] font-extrabold leading-10 tracking-tight text-neutral-900">{days(progress.worked)}</p>
          <p className="text-[12px] text-neutral-500">{t('workDays.workedStatSub')}</p>
        </div>
        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <p className="text-[12.5px] font-semibold text-neutral-500">{t('workDays.creditedStat')}</p>
          <p className="text-[34px] font-extrabold leading-10 tracking-tight text-neutral-900">{days(progress.credited)}</p>
          <p className="text-[12px] text-neutral-500">{t('workDays.creditedStatSub')}</p>
        </div>
      </div>

      <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{t('workDays.clockedIn')}</p>
      <div className="rounded-2xl bg-white px-4 py-1 shadow-card">
        {worked.length === 0 && <p className="py-3 text-[13px] text-neutral-500">{t('workDays.noClockIns')}</p>}
        {worked.map((d) => row(d, d.weekday >= 6 ? t('workDays.weekendWorked') : '', t('workDays.lblWorked'), 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'))}
      </div>

      {notWorked.length > 0 && (
        <>
          <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{t('workDays.notWorked')}</p>
          <div className="rounded-2xl bg-white px-4 py-1 shadow-card">
            {notWorked.map((d) => row(d, t(d.kind === 'missing' ? 'workDays.rowMissing' : 'workDays.rowRest'), d.kind === 'missing' ? t('workDays.tagOff') : t('workDays.tagRest'), d.kind === 'missing' ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'))}
          </div>
        </>
      )}

      {credited.length > 0 && (
        <>
          <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{t('workDays.comingCredited')}</p>
          <div className="rounded-2xl bg-white px-4 py-1 shadow-card">
            {credited.map((d) => row(d, d.kind === 'holiday' ? (d.holidayName ?? t('workDays.lblHoliday')) : t('workDays.rowLeave'), t('workDays.creditedStat'), 'bg-status-working/10 text-status-working'))}
          </div>
        </>
      )}
    </>
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
