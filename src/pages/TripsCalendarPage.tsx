import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { monthGrid } from '@/features/calendar/calendar'
import { leaveService } from '@/features/leave/leaveService'
import type { LeaveRequest } from '@/features/leave/types'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { dayLabel, money, ppToday, provinceName } from '@/features/trips/trip'
import { tripErrorMessage, tripService, type TripRow } from '@/features/trips/tripService'
import { StatusPill } from '@/features/trips/TripParts'
import { displayName } from '@/lib/displayName'

const card = 'rounded-[18px] border border-neutral-100 bg-white shadow-card'
const LIVE = ['pending', 'changes', 'approved']
const LANE = 26
const TOP = 34

const tripTitle = (t: TripRow) => {
  const provs = [...new Set(t.days.flatMap((d) => d.provinces))]
  return provs.slice(0, 2).map(provinceName).join(', ') + (provs.length > 2 ? ` +${provs.length - 2}` : '')
}
const short = (d: string) => `${Number(d.slice(8, 10))}`
const span = (a: string, b: string) => (a === b ? dayLabel(a) : a.slice(0, 7) === b.slice(0, 7) ? `${short(a)}–${dayLabel(b).split(' ').slice(1).join(' ')}` : `${dayLabel(a)} – ${dayLabel(b)}`)

type Bar = { key: string; col: number; width: number; lane: number; label: string; tone: string; aria: string; trip?: TripRow; roundL: boolean; roundR: boolean }

/**
 * Trips calendar (canvas Polish › Trips calendar, from Approvals › Trips):
 * the team's sales trips as bars across their days, with leave underneath
 * so clashes show. Pick a trip for its numbers and to review or open it.
 */
export function TripsCalendarPage() {
  const { profile } = useProfile()
  const today = ppToday()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [trips, setTrips] = useState<TripRow[] | null>(null)
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([tripService.team().catch(() => [] as TripRow[]), tripService.mine(), leaveService.listRequests().catch(() => [] as LeaveRequest[]), usersService.list().catch(() => [] as ManagedUser[])])
      .then(([team, mine, l, p]) => {
        const all = new Map([...mine, ...team].map((t) => [t.id, t]))
        setTrips([...all.values()].filter((t) => LIVE.includes(t.status)))
        setLeave(l.filter((r) => r.status === 'approved' || r.status === 'pending'))
        setPeople(p)
      })
      .catch((e) => {
        setError(tripErrorMessage(e))
        setTrips([])
      })
  }, [])

  const grid = monthGrid(ym.y, ym.m)
  const monthStart = grid.days.find((d) => d.inMonth)!.date
  const monthEnd = [...grid.days].reverse().find((d) => d.inMonth)!.date
  const name = useMemo(() => Object.fromEntries(people.map((p) => [p.id, displayName(p.fullName, p.nickname)])), [people])
  const first = (n: string) => n.split(' ')[0]
  const inMonth = (trips ?? []).filter((t) => t.start_date <= monthEnd && t.end_date >= monthStart).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const monthLeave = leave.filter((r) => r.start_date <= grid.to && r.end_date >= grid.from && r.user_id !== profile?.id && name[r.user_id])
  const sel = inMonth.find((t) => t.id === selId) ?? inMonth.find((t) => t.can_decide) ?? inMonth[0] ?? null
  const waiting = (t: TripRow) => t.status !== 'approved'

  const weeks = Array.from({ length: grid.days.length / 7 }, (_, w) => {
    const days = grid.days.slice(w * 7, w * 7 + 7)
    const a = days[0].date
    const b = days[6].date
    const col = (d: string) => days.findIndex((x) => x.date === d)
    const items: { from: string; to: string; make: (lane: number) => Bar }[] = []
    for (const r of monthLeave) {
      if (r.start_date > b || r.end_date < a) continue
      const from = r.start_date < a ? a : r.start_date
      const to = r.end_date > b ? b : r.end_date
      const who = first(name[r.user_id])
      items.push({ from, to, make: (lane) => ({ key: `l${r.id}${w}`, col: col(from), width: col(to) - col(from) + 1, lane, label: `${who} · ${r.status === 'pending' ? 'leave?' : 'leave'}`, tone: 'bg-neutral-100 text-neutral-600', aria: `${who} on leave ${span(r.start_date, r.end_date)}`, roundL: r.start_date >= a, roundR: r.end_date <= b }) })
    }
    for (const t of inMonth) {
      if (t.start_date > b || t.end_date < a) continue
      const from = t.start_date < a ? a : t.start_date
      const to = t.end_date > b ? b : t.end_date
      const wait = waiting(t)
      items.push({
        from,
        to,
        make: (lane) => ({
          key: `t${t.id}${w}`,
          col: col(from),
          width: col(to) - col(from) + 1,
          lane,
          label: `${wait ? '◷ ' : ''}${tripTitle(t)}`,
          tone: wait ? 'border-[1.5px] border-dashed border-status-warn bg-status-warn/10 text-status-warn' : 'bg-status-working text-white',
          aria: `${tripTitle(t)}, ${t.people.map((p) => p.name).join(' and ')}, ${span(t.start_date, t.end_date)}, ${wait ? 'waiting' : 'approved'}`,
          trip: t,
          roundL: t.start_date >= a,
          roundR: t.end_date <= b,
        }),
      })
    }
    const lanes: string[] = []
    const bars = items
      .sort((x, y) => x.from.localeCompare(y.from))
      .map((it) => {
        let lane = lanes.findIndex((end) => end < it.from)
        if (lane < 0) lane = lanes.push('') - 1
        lanes[lane] = it.to
        return it.make(lane)
      })
    return { days, bars, height: TOP + Math.max(lanes.length, 1) * LANE + 4 }
  })

  const shift = (d: number) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }))
  const planned = inMonth.reduce((n, t) => n + (t.est_total ?? 0), 0)
  const waitingCount = inMonth.filter((t) => t.can_decide).length
  const clash = (t: TripRow) => {
    const ids = new Set(t.people.map((p) => p.user_id))
    const hit = leave.find((r) => ids.has(r.user_id) && r.start_date <= t.end_date && r.end_date >= t.start_date)
    return hit ? `${name[hit.user_id] ?? 'Someone on this trip'} is on leave ${span(hit.start_date, hit.end_date)}` : null
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3 md:max-w-2xl md:px-8">
      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      <section aria-label="Calendar" className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between px-2.5 py-3">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 dark:border-neutral-700">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-base font-extrabold text-neutral-900">{grid.label}</p>
            <p className="text-xs text-neutral-500">
              {inMonth.length} {inMonth.length === 1 ? 'trip' : 'trips'} · {waitingCount} waiting · {money(planned)} planned
            </p>
          </div>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 dark:border-neutral-700">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 border-y border-neutral-100 bg-neutral-50 py-1.5 dark:border-neutral-800 dark:bg-neutral-900">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d} className="text-center text-[11px] font-bold uppercase text-neutral-500">
              {d}
            </span>
          ))}
        </div>
        {trips === null && <div className="m-3 h-48 animate-pulse rounded-xl bg-neutral-100" />}
        {trips !== null &&
          weeks.map((wk, w) => (
            <div key={w} className={`relative ${w < weeks.length - 1 ? 'border-b border-neutral-100 dark:border-neutral-800' : ''}`} style={{ height: wk.height }}>
              <div className="grid grid-cols-7 pt-1.5">
                {wk.days.map((d) => (
                  <span key={d.date} className="flex justify-center">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] ${d.date === today ? 'font-bold text-brand-500 ring-2 ring-inset ring-brand-500' : d.inMonth ? 'font-medium text-neutral-900' : 'text-neutral-400'}`}>{d.day}</span>
                  </span>
                ))}
              </div>
              {wk.bars.map((b) => {
                const on = !!b.trip && b.trip.id === sel?.id
                const style = { left: `calc(${(b.col / 7) * 100}% + 2px)`, width: `calc(${(b.width / 7) * 100}% - 4px)`, top: TOP + b.lane * LANE }
                const cls = `absolute flex h-[22px] items-center overflow-hidden whitespace-nowrap px-1.5 text-[11px] font-bold ${b.tone} ${b.roundL ? 'rounded-l-md' : ''} ${b.roundR ? 'rounded-r-md' : ''} ${on ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-[#232323]' : ''}`
                return b.trip ? (
                  <button key={b.key} type="button" onClick={() => setSelId(b.trip!.id)} aria-label={b.aria} aria-pressed={on} className={cls} style={style}>
                    <span className="truncate">{b.label}</span>
                  </button>
                ) : (
                  <span key={b.key} role="img" aria-label={b.aria} className={cls} style={style}>
                    <span className="truncate">{b.label}</span>
                  </span>
                )
              })}
            </div>
          ))}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-neutral-100 px-3.5 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[3px] bg-status-working" /> Approved trip
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[3px] border-[1.5px] border-dashed border-status-warn bg-status-warn/10" /> Waiting
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[3px] bg-neutral-100" /> Leave
          </span>
        </div>
      </section>

      {sel && (
        <section aria-label="Selected trip" className={`${card} space-y-3 p-3.5`}>
          <div className="flex items-start gap-3">
            <span className="w-12 shrink-0 overflow-hidden rounded-xl border border-neutral-100 text-center dark:border-neutral-800">
              <span className={`block py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${waiting(sel) ? 'bg-status-warn' : 'bg-status-working'}`}>{dayLabel(sel.start_date).split(' ')[2]}</span>
              <span className="block py-1 text-[19px] font-extrabold leading-[22px] text-neutral-900">{short(sel.start_date)}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold text-neutral-900">{tripTitle(sel)}</span>
              <span className="block text-[12.5px] text-neutral-600">
                {span(sel.start_date, sel.end_date)} · {sel.days.length} {sel.days.length === 1 ? 'day' : 'days'}
              </span>
              <span className="block truncate text-[12.5px] text-neutral-500">{sel.people.map((p) => p.full_name).join(' + ')}</span>
            </span>
            <StatusPill status={sel.status} />
          </div>
          <div className="grid grid-cols-3 rounded-xl bg-neutral-50 py-2 text-center dark:bg-neutral-900">
            {[
              ['People', String(sel.people_count)],
              ['Room-nights', String(sel.room_nights)],
              ['Estimated', money(sel.est_total ?? 0)],
            ].map(([l, v], i) => (
              <div key={l} className={i ? 'border-l border-neutral-200 dark:border-neutral-700' : ''}>
                <p className="text-[11px] text-neutral-500">{l}</p>
                <p className="text-[15px] font-extrabold text-neutral-900">{v}</p>
              </div>
            ))}
          </div>
          {clash(sel) && (
            <p className="flex items-start gap-2 rounded-xl bg-status-warn/10 px-3 py-2 text-[12.5px] font-semibold text-status-warn">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden /> {clash(sel)}
            </p>
          )}
          <Link to={`/trips/${sel.id}`} className={`flex h-11 items-center justify-center rounded-xl text-sm font-extrabold ${sel.can_decide ? 'bg-brand-500 text-white' : 'border border-neutral-200 text-brand-500 dark:border-neutral-700'}`}>
            {sel.can_decide ? 'Review request' : 'View trip'}
          </Link>
        </section>
      )}

      <section aria-label="This month">
        <p className="px-0.5 pb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
          This month · {inMonth.length} {inMonth.length === 1 ? 'trip' : 'trips'}
        </p>
        <div className={`${card} px-3.5`}>
          {trips !== null && inMonth.length === 0 && <p className="py-5 text-center text-[13.5px] text-neutral-500">No trips in {grid.label}.</p>}
          {inMonth.map((t, i) => (
            <button key={t.id} type="button" onClick={() => setSelId(t.id)} className={`flex w-full items-center gap-3 py-3 text-left ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
              <span className={`h-9 w-1 shrink-0 rounded-full ${waiting(t) ? 'bg-status-warn' : 'bg-status-working'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-neutral-900">
                  {tripTitle(t)} · {span(t.start_date, t.end_date)}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {t.people.map((p) => p.name).join(', ')} · {t.can_decide ? 'waiting for you' : t.status === 'approved' ? 'approved' : t.status === 'changes' ? 'changes asked' : 'waiting'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-extrabold text-neutral-900">{money(t.est_total ?? 0)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
