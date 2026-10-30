import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { displayName } from '@footprints/shared/lib/displayName'
import { APP_TIMEZONE } from '@footprints/shared/lib/config'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import type { ActivityRow } from './customerBookService'
import { CHIP_TONE, agoText, dayDiff, daysText, formatUsd0, localDay, outcomeChips, shortDay, statusLabel, visitMetrics } from './book'

const AVATAR = ['bg-brand-500', 'bg-status-visiting', 'bg-status-working', 'bg-status-warn', 'bg-earth-500', 'bg-brand-600']

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase())
    .join('')
}

function hashIndex(id: string, n: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % n
}

/**
 * The detail page's visit picture: two compact tiles (last visit, last
 * outcome), the next planned visit, and everyone's
 * visits with date, who and outcome. Voided visits are listed but faded and
 * never counted.
 */
export function CustomerVisitActivity({ rows, loading }: { rows: ActivityRow[]; loading: boolean }) {
  const { t, language } = useLanguage()
  const [showAll, setShowAll] = useState(false)
  const today = localDay(new Date().toISOString(), APP_TIMEZONE)
  const m = visitMetrics(rows, today)
  const name = (r: ActivityRow) => displayName(r.full_name ?? '', r.nickname) || t('customerDetail.someone')

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    )
  }

  const last = m.last
  const tiles = [
    {
      label: t('customerDetail.lastVisit'),
      value: m.lastDays == null ? t('customerDetail.never') : daysText(m.lastDays, t),
      sub: last ? `${shortDay(last.checked_in_at, language)} · ${name(last)}` : t('customerDetail.noVisitsYear'),
      tone: 'text-neutral-900',
    },
    {
      label: t('customerDetail.lastOutcome'),
      value: statusLabel(last?.order_status ?? last?.visit_status ?? '—', t),
      sub: last ? [last.order_amount ? formatUsd0(last.order_amount) : null, last.payment_status ? statusLabel(last.payment_status, t) : null].filter(Boolean).join(' · ') || (last.visit_status ? statusLabel(last.visit_status, t) : '') : '',
      tone: 'text-neutral-900',
    },
  ]
  const shown = showAll ? rows : rows.slice(0, 5)

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="flex min-w-0 flex-col rounded-2xl bg-white px-3 py-2 shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{t.label}</span>
            <span className={`truncate text-[17px] font-extrabold leading-6 tabular-nums ${t.tone}`}>{t.value}</span>
            <span className="truncate text-[11.5px] text-neutral-600">{t.sub}</span>
          </div>
        ))}
      </div>
      {m.next && (
        <p className="mx-0.5 mt-2 flex items-center gap-1.5 text-[12.5px] text-neutral-600">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {t('customerDetail.nextPlanned', { date: shortDay(m.next.day, language) })}
          {m.next.by ? ` · ${m.next.by}` : ''}
        </p>
      )}

      <div className="mt-2 rounded-2xl bg-white px-3.5 py-1 shadow-card">
        <p className="mb-0.5 mt-2.5 flex justify-between text-[11.5px] font-extrabold uppercase tracking-wide text-neutral-500">
          <span>{t('customerDetail.visitActivity')}</span>
          <span>{t('customerDetail.in90', { n: m.visits90 })}</span>
        </p>
        {rows.length === 0 && <p className="border-t border-neutral-100 py-4 text-sm text-neutral-500">{t('customerDetail.noneRecorded')}</p>}
        {shown.map((r) => {
          const n = name(r)
          const days = dayDiff(localDay(r.checked_in_at), today)
          const chips = outcomeChips(r, t)
          const note = r.cancelled_at ? (r.cancel_reason ? t('customerDetail.voidedReason', { reason: r.cancel_reason }) : t('customerDetail.voided')) : r.remarks
          return (
            <div key={r.visit_id} className={`flex gap-2.5 border-t border-neutral-100 py-3 ${r.cancelled_at ? 'opacity-60' : ''}`}>
              <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold text-white ${AVATAR[hashIndex(r.user_id, AVATAR.length)]}`}>
                {initials(n)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-neutral-900">
                    {shortDay(r.checked_in_at, language)} <span className="text-xs font-semibold text-neutral-500">· {agoText(days, t)}</span>
                  </span>
                  {r.cancelled_at && <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-extrabold text-neutral-500 dark:bg-neutral-800">{t('customerDetail.voided')}</span>}
                </div>
                <span className="text-[12.5px] text-neutral-600">{t('customerDetail.visitedBy', { name: n })}</span>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${CHIP_TONE[c.tone]}`}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {note && <span className="text-xs text-neutral-500">{note}</span>}
              </div>
            </div>
          )
        })}
        {!showAll && rows.length > 5 && (
          <button type="button" onClick={() => setShowAll(true)} className="h-11 w-full border-t border-neutral-100 text-[13.5px] font-bold text-brand-500">
            {t('customerDetail.showAllVisits', { n: rows.length })}
          </button>
        )}
      </div>
    </>
  )
}
