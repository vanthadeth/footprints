import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { todayDateString } from '@/lib/dateRange'
import { flexService } from '@/features/flex/flexService'
import { addDays, cycleLabel, dayDate, days, shortDate } from '@/features/flex/flex'
import { counted, teamProgressStatus, type TeamProgressRow } from '@/features/flex/progress'

const TONE = {
  ok: 'bg-status-working/10 text-status-working',
  warn: 'bg-status-warn/10 text-status-warn',
  danger: 'bg-status-danger/10 text-status-danger',
  muted: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800',
} as const

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '·'

type Filter = 'all' | 'risk' | 'short'

/**
 * Working days · team (Hub › Team / HR / Administration): each person on
 * flexible days off that the caller may see, with their progress toward the
 * minimum working days this cycle. A row opens that person's page, read-only.
 */
export function FlexTeamPage() {
  const { t, language } = useLanguage()
  const [params, setParams] = useSearchParams()
  const today = todayDateString()
  const date = params.get('d') ?? today
  const [rows, setRows] = useState<TeamProgressRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [minDays, setMinDays] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    flexService
      .teamProgress(date)
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('flex.teamLoadFailed')))
    flexService
      .rule()
      .then((r) => !cancelled && setMinDays(r.minDays))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [date, t])

  const active = useMemo(() => (rows ?? []).filter((r) => r.isFlexible), [rows])
  const statusOf = (r: TeamProgressRow) => teamProgressStatus(r, t, (s) => shortDate(s, language))
  const isShort = (r: TeamProgressRow) => r.isFlexible && (r.settled ? r.shortDays > 0 : r.spare < 0)
  const isRisk = (r: TeamProgressRow) => r.isFlexible && !r.settled && r.stillNeeded > 0 && r.spare >= 0 && r.spare <= 1
  const counts = { all: active.length, risk: active.filter(isRisk).length, short: active.filter(isShort).length }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .filter((r) => (filter === 'all' ? true : filter === 'short' ? isShort(r) : isRisk(r)))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.departmentName ?? '').toLowerCase().includes(q))
      .sort((a, b) => Number(isShort(b)) - Number(isShort(a)) || Number(isRisk(b)) - Number(isRisk(a)) || a.name.localeCompare(b.name))
  }, [rows, query, filter])

  const cycle = rows?.[0] ? { cycleStart: rows[0].cycleStart, cycleEnd: rows[0].cycleEnd } : null
  const isCurrent = !cycle || (cycle.cycleStart <= today && today <= cycle.cycleEnd)
  const go = (d: string | null) => setParams(d ? { d } : {}, { replace: true })

  const sub = (r: TeamProgressRow) => {
    if (!r.isFlexible) return r.departmentName ?? t('flex.noDept')
    if (r.settled && r.minDays == null) return t('workDays.teamLegacy')
    const have = days(counted(r))
    const min = days(r.minDays ?? 0)
    if (r.settled) return r.shortDays > 0 ? t('workDays.teamSubShort', { have, min, n: days(r.shortDays) }) : t('workDays.teamSettled', { have, min })
    if (r.stillNeeded <= 0) return t('workDays.teamSubMet', { have, min })
    return t('workDays.teamSub', { have, min, need: days(r.stillNeeded), avail: days(r.available), spare: days(Math.max(0, r.spare)) })
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3 md:max-w-3xl md:px-8">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => cycle && go(addDays(cycle.cycleStart, -1))} disabled={!cycle} aria-label={t('workDays.prevCycle')} className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[16px] font-extrabold text-neutral-900">{cycle ? cycleLabel(cycle, language) : t('flex.thisCycle')}</p>
          <p className="text-[12.5px] text-neutral-500">{cycle ? (isCurrent ? t('workDays.thisCycleSettles', { date: dayDate(addDays(cycle.cycleEnd, 1), language) }) : cycle.cycleEnd < today ? t('workDays.closedOn', { date: dayDate(cycle.cycleEnd, language) }) : t('flex.nextCycle')) : ' '}</p>
        </div>
        <button
          type="button"
          onClick={() => cycle && go(addDays(cycle.cycleEnd, 1) > today ? null : addDays(cycle.cycleEnd, 1))}
          disabled={isCurrent}
          aria-label={t('workDays.nextCycle')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {!rows && !error && (
        <div className="space-y-2">
          <div className="h-12 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-2xl bg-white p-5 text-center shadow-card">
          <p className="text-[15px] font-bold text-neutral-900">{t('flex.noOneTitle')}</p>
          <p className="mt-1 text-[13px] text-neutral-500">{t('workDays.teamEmpty')}</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div role="group" aria-label={t('workDays.heroLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {([['all', 'workDays.fAll'], ['risk', 'workDays.fRisk'], ['short', 'workDays.fShort']] as const).map(([k, key]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`h-9 shrink-0 rounded-full border-[1.5px] px-3.5 text-[13.5px] ${filter === k ? 'border-brand-500 bg-brand-500 font-bold text-white' : 'border-neutral-300 font-semibold text-neutral-900 dark:border-neutral-600'}`}>
                {t(key, { n: counts[k] })}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 dark:border-neutral-800">
            <Search className="h-4 w-4 text-neutral-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('flex.searchPh')} aria-label={t('flex.searchAria')} className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400" />
          </label>

          <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
            {shown.map((r, i) => {
              const st = statusOf(r)
              const min = r.minDays ?? 0
              const pct = min ? Math.min(100, Math.round((counted(r) / min) * 100)) : 0
              return (
                <li key={r.userId} className={i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                  <Link to={`/leave/days-off?user=${r.userId}${params.get('d') ? `&d=${params.get('d')}` : ''}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12.5px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{initials(r.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-neutral-900">{r.name}</span>
                      <span className="block truncate text-[12.5px] text-neutral-500">{sub(r)}</span>
                      {r.isFlexible && min > 0 && (
                        <span aria-hidden className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <span className={isShort(r) ? 'bg-status-danger' : 'bg-brand-500'} style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${TONE[st.tone]}`}>{st.label}</span>
                      {r.isFlexible && isShort(r) && (
                        <span className="text-[11px] font-bold text-neutral-500">
                          {r.settled
                            ? [r.annualDays ? t('workDays.teamAl', { n: days(r.annualDays) }) : '', r.unpaidDays ? t('workDays.teamUl', { n: days(r.unpaidDays) }) : ''].filter(Boolean).join(' · ')
                            : ''}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  </Link>
                </li>
              )
            })}
            {shown.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-neutral-500">{query ? t('flex.noMatch', { q: query }) : t('workDays.teamNone')}</li>}
          </ul>

          <p className="px-1 text-[12px] leading-snug text-neutral-500">{t('workDays.teamNote', { n: minDays ?? 20 })}</p>
        </>
      )}
    </div>
  )
}
