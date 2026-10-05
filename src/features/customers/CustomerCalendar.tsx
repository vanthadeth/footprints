import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ActivityRow } from './customerBookService'
import { localDay } from './book'
import { todayDateString } from '@/lib/dateRange'
import { formatTime } from '@/lib/datetime'
import { displayName } from '@/lib/displayName'

const pad = (n: number) => String(n).padStart(2, '0')
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * A customer's visits on a month grid, in the app's one calendar style (see
 * the canvas's calendars): 28px day circles, today ringed in blue, the picked
 * day filled, a dot for each day with a visit and an outlined dot for a
 * planned next visit; the picked day's visits are listed underneath.
 */
export function CustomerCalendar({ rows }: { rows: ActivityRow[] }) {
  const today = todayDateString()
  const [ty, tm] = today.split('-').map(Number)
  const [month, setMonth] = useState({ y: ty, m: tm })
  const [picked, setPicked] = useState(today)

  const visitsByDay = new Map<string, ActivityRow[]>()
  const nextDays = new Set<string>()
  for (const r of rows) {
    if (r.cancelled_at) continue
    const d = localDay(r.checked_in_at)
    visitsByDay.set(d, [...(visitsByDay.get(d) ?? []), r])
    if (r.next_visit) nextDays.add(r.next_visit.slice(0, 10))
  }

  const first = new Date(Date.UTC(month.y, month.m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month.y}-${pad(month.m)}-${pad(i + 1)}`)]
  const shift = (delta: number) => setMonth(({ y, m }) => ({ y: m + delta > 12 ? y + 1 : m + delta < 1 ? y - 1 : y, m: ((m - 1 + delta + 12) % 12) + 1 }))
  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const dayRows = visitsByDay.get(picked) ?? []
  const monthVisits = [...visitsByDay.entries()].filter(([d]) => d.startsWith(`${month.y}-${pad(month.m)}`)).reduce((n, [, v]) => n + v.length, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-900">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-[15px] font-bold text-neutral-900">{label}</p>
            <p className="text-xs text-neutral-500">
              {monthVisits} {monthVisits === 1 ? 'visit' : 'visits'}
            </p>
          </div>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-900">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {WEEK.map((d, i) => (
            <span key={i} className="pb-1 text-[11px] font-bold text-neutral-500">
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />
            const isToday = d === today
            const isPicked = d === picked
            const has = visitsByDay.has(d)
            const planned = nextDays.has(d)
            return (
              <button key={d} type="button" onClick={() => setPicked(d)} aria-pressed={isPicked} className="flex h-[50px] flex-col items-center justify-center gap-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                    isPicked ? 'bg-brand-500 font-bold text-white' : isToday ? 'font-bold text-brand-500 ring-2 ring-inset ring-brand-500' : 'font-medium text-neutral-900'
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full ${has ? 'bg-brand-500' : planned ? 'border-[1.5px] border-brand-500' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex gap-4 border-t border-neutral-100 pt-2.5 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Visit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-brand-500" /> Next visit planned
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full ring-2 ring-inset ring-brand-500" /> Today
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-100 bg-white px-3.5 py-1 shadow-card">
        <p className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
          {new Date(`${picked}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
        </p>
        {dayRows.length === 0 && <p className="border-t border-neutral-100 py-3 text-sm text-neutral-500">{nextDays.has(picked) ? 'Next visit planned for this day.' : 'No visits this day.'}</p>}
        {dayRows.map((r) => (
          <div key={r.visit_id} className="flex gap-3 border-t border-neutral-100 py-2.5">
            <span className="w-11 shrink-0 text-xs font-bold tabular-nums text-neutral-500">{formatTime(r.checked_in_at)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-neutral-900">{r.full_name ? displayName(r.full_name, r.nickname) : 'Someone'}</span>
              <span className="block text-xs text-neutral-500">{[r.visit_status, r.order_status, r.payment_status].filter(Boolean).join(' · ') || 'Visit'}</span>
              {r.remarks && <span className="mt-0.5 block text-[13px] text-neutral-600">{r.remarks}</span>}
            </span>
            {r.order_amount != null && <span className="shrink-0 text-sm font-bold text-neutral-900">${r.order_amount.toLocaleString('en-US')}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
