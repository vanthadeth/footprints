import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { displayName } from '@/lib/displayName'
import { APP_TIMEZONE } from '@/lib/config'
import type { ActivityRow } from './customerBookService'
import { CHIP_TONE, agoText, dayDiff, formatUsd0, localDay, outcomeChips, shortDay, visitMetrics } from './book'

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
 * The detail page's visit picture: four metric tiles (last visit, visits in
 * 90 days, frequency, last outcome), the next planned visit, and everyone's
 * visits with date, who and outcome. Voided visits are listed but faded and
 * never counted.
 */
export function CustomerVisitActivity({ rows, loading }: { rows: ActivityRow[]; loading: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const today = localDay(new Date().toISOString(), APP_TIMEZONE)
  const m = visitMetrics(rows, today)
  const name = (r: ActivityRow) => displayName(r.full_name ?? '', r.nickname) || 'Someone'

  if (loading) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    )
  }

  const last = m.last
  const tiles = [
    {
      label: 'Last visit',
      value: m.lastDays == null ? 'Never' : m.lastDays === 0 ? 'Today' : `${m.lastDays} ${m.lastDays === 1 ? 'day' : 'days'}`,
      sub: last ? `${shortDay(last.checked_in_at)} · ${name(last)}` : 'No visits in the last year',
      tone: 'text-neutral-900',
    },
    {
      label: 'Visits · 90 days',
      value: String(m.visits90),
      sub: m.visits90 ? `by ${m.people90} ${m.people90 === 1 ? 'person' : 'people'}` : 'none yet',
      tone: 'text-neutral-900',
    },
    {
      label: 'Visit frequency',
      value: m.freqDays ? `~${m.freqDays} days` : '—',
      sub: m.freqDays ? 'average gap, last 90 days' : 'needs 2 visits in 90 days',
      tone: m.freqDays == null ? 'text-neutral-900' : m.freqDays <= 14 ? 'text-status-working' : 'text-status-warn',
    },
    {
      label: 'Last outcome',
      value: last?.order_status ?? last?.visit_status ?? '—',
      sub: last ? [last.order_amount ? formatUsd0(last.order_amount) : null, last.payment_status].filter(Boolean).join(' · ') || (last.visit_status ?? '') : '',
      tone: 'text-neutral-900',
    },
  ]
  const shown = showAll ? rows : rows.slice(0, 5)

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-0.5 rounded-2xl bg-white px-3.5 py-3 shadow-card">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-neutral-500">{t.label}</span>
            <span className={`truncate text-[22px] font-extrabold tabular-nums ${t.tone}`}>{t.value}</span>
            <span className="truncate text-xs text-neutral-600">{t.sub}</span>
          </div>
        ))}
      </div>
      {m.next && (
        <p className="mx-0.5 mt-2 flex items-center gap-1.5 text-[12.5px] text-neutral-600">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Next visit planned {shortDay(m.next.day)}
          {m.next.by ? ` · ${m.next.by}` : ''}
        </p>
      )}

      <div className="mt-3 rounded-2xl bg-white px-3.5 py-1 shadow-card">
        <p className="mb-0.5 mt-2.5 flex justify-between text-[11.5px] font-extrabold uppercase tracking-wide text-neutral-500">
          <span>Visit activity</span>
          <span>{m.visits90} in 90 days</span>
        </p>
        {rows.length === 0 && <p className="border-t border-neutral-100 py-4 text-sm text-neutral-500">No visits recorded yet.</p>}
        {shown.map((r) => {
          const n = name(r)
          const days = dayDiff(localDay(r.checked_in_at), today)
          const chips = outcomeChips(r)
          const note = r.cancelled_at ? `Voided${r.cancel_reason ? `: ${r.cancel_reason}` : ''}` : r.remarks
          return (
            <div key={r.visit_id} className={`flex gap-2.5 border-t border-neutral-100 py-3 ${r.cancelled_at ? 'opacity-60' : ''}`}>
              <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold text-white ${AVATAR[hashIndex(r.user_id, AVATAR.length)]}`}>
                {initials(n)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-neutral-900">
                    {shortDay(r.checked_in_at)} <span className="text-xs font-semibold text-neutral-500">· {agoText(days)}</span>
                  </span>
                  {r.cancelled_at && <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-extrabold text-neutral-500 dark:bg-neutral-800">Voided</span>}
                </div>
                <span className="text-[12.5px] text-neutral-600">Visited by {n}</span>
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
            Show all {rows.length} visits
          </button>
        )}
      </div>
    </>
  )
}
