import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { todayDateString } from '@/lib/dateRange'
import { flexService, type FlexTeamRow } from '@/features/flex/flexService'
import { addDays, cycleLabel, dayDate, days, teamStatus } from '@/features/flex/flex'

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

/**
 * Flexible days off (Hub › Team / HR / Administration): each person on
 * Flexible (travel) days off that the caller may see -- their team for a
 * manager, everyone for HR and Super Admin -- with this cycle's balance.
 * A row opens that person's Days off, read-only.
 */
export function FlexTeamPage() {
  const { t, language } = useLanguage()
  const [params, setParams] = useSearchParams()
  const today = todayDateString()
  const date = params.get('d') ?? today
  const [rows, setRows] = useState<FlexTeamRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setRows(null)
    flexService
      .team(date)
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('flex.teamLoadFailed')))
    return () => {
      cancelled = true
    }
  }, [date, t])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || (r.departmentName ?? '').toLowerCase().includes(q))
  }, [rows, query])

  // The cycle comes back on every row; with nobody to show, work it out from the first row or the date.
  const cycle = rows?.[0] ? { cycleStart: rows[0].cycleStart, cycleEnd: rows[0].cycleEnd } : null
  const isCurrent = !cycle || (cycle.cycleStart <= today && today <= cycle.cycleEnd)
  const go = (d: string | null) => setParams(d ? { d } : {}, { replace: true })
  const active = (rows ?? []).filter((r) => r.isFlexible)
  const overCount = active.filter((r) => r.left < 0).length
  const plannedTotal = active.reduce((a, r) => a + r.planned, 0)

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3 md:max-w-3xl md:px-8">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => cycle && go(addDays(cycle.cycleStart, -1))} disabled={!cycle} aria-label={t('flex.prevCycle')} className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[16px] font-extrabold text-neutral-900">{cycle ? cycleLabel(cycle, language) : t('flex.thisCycle')}</p>
          <p className="text-[12.5px] text-neutral-500">{cycle ? (isCurrent ? t('flex.thisCycleSettles', { date: dayDate(cycle.cycleEnd, language) }) : cycle.cycleEnd < today ? t('flex.closedOn', { date: dayDate(cycle.cycleEnd, language) }) : t('flex.nextCycle')) : ' '}</p>
        </div>
        <button
          type="button"
          onClick={() => cycle && go(addDays(cycle.cycleEnd, 1) > today ? null : addDays(cycle.cycleEnd, 1))}
          disabled={isCurrent}
          aria-label={t('flex.nextCycleBtn')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {!rows && !error && (
        <div className="space-y-2">
          <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-2xl bg-white p-5 text-center shadow-card">
          <p className="text-[15px] font-bold text-neutral-900">{t('flex.noOneTitle')}</p>
          <p className="mt-1 text-[13px] text-neutral-500">{t('flex.noOneBody')}</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label={t('flex.tileOn')} value={String(active.length)} />
            <Tile label={t('flex.tileOver')} value={String(overCount)} tone={overCount ? 'text-status-danger' : 'text-neutral-900'} />
            <Tile label={t('flex.tilePlanned')} value={days(plannedTotal)} />
          </div>

          <label className="flex items-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 dark:border-neutral-800">
            <Search className="h-4 w-4 text-neutral-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('flex.searchPh')} aria-label={t('flex.searchAria')} className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400" />
          </label>

          <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
            {shown.map((r, i) => {
              const st = teamStatus(r, t, language)
              const pct = (x: number) => `${r.allowance ? Math.min(100, Math.round((x / r.allowance) * 100)) : 0}%`
              return (
                <li key={r.userId} className={i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                  <Link to={`/leave/days-off?user=${r.userId}${params.get('d') ? `&d=${params.get('d')}` : ''}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[13px] font-extrabold text-white">{initials(r.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-bold text-neutral-900">{r.name}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${TONE[st.tone]}`}>{st.label}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-neutral-500">
                        {r.departmentName ?? t('flex.noDept')}
                        {r.isFlexible && t('flex.takenDot', { n: days(r.taken) })}
                        {r.isFlexible && r.planned > 0 && t('flex.plannedDot', { n: days(r.planned) })}
                        {r.settled && r.annualDays ? t('flex.fromAnnual', { n: days(r.annualDays) }) : ''}
                      </span>
                      {r.isFlexible && (
                        <span aria-hidden className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <span className={r.left < 0 ? 'bg-status-danger' : 'bg-status-visiting'} style={{ width: pct(r.taken) }} />
                          <span className="bg-status-visiting/35" style={{ width: pct(Math.max(0, Math.min(r.planned, r.allowance - r.taken))) }} />
                        </span>
                      )}
                    </span>
                    {r.isFlexible && (
                      <span className="shrink-0 text-right">
                        <span className={`block text-[20px] font-extrabold leading-none ${r.left < 0 ? 'text-status-danger' : 'text-neutral-900'}`}>{r.left < 0 ? `+${days(-r.left)}` : days(r.left)}</span>
                        <span className="block text-[11px] font-semibold text-neutral-500">{r.left < 0 ? t('flex.over') : t('flex.ofLeft', { n: days(r.allowance) })}</span>
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  </Link>
                </li>
              )
            })}
            {shown.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-neutral-500">{t('flex.noMatch', { q: query })}</li>}
          </ul>

          <p className="px-1 text-[12px] leading-snug text-neutral-500">{t('flex.teamNote')}</p>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, tone = 'text-neutral-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-card">
      <p className="text-[11.5px] font-bold text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-[22px] font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}
