import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Clock, MessagesSquare } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useMessages } from '@/features/conversations/MessagesContext'
import { calendarService, type CalendarItem } from '@/features/calendar/calendarService'
import { KIND, addDays, hhmm, itemSub, itemTitle, overdue, sortDay } from '@/features/calendar/calendar'
import { localDay } from '@/features/customers/book'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { forYou } from '@/features/nav/navConfig'
import { displayName } from '@/lib/displayName'
import { greeting } from '@/lib/datetime'

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/**
 * Today (back office home tab): clock-in status, today's agenda from the
 * calendar (collections, call follow-ups, tasks, appointments) with anything
 * overdue, what's still to collect this week, and the person's shortcuts.
 */
export function TodayPage() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const { attendance } = useJourneyContext()
  const { unreadCount } = useMessages()
  const { group, ctx } = useRoleGroup()
  const today = localDay(new Date().toISOString())
  const [items, setItems] = useState<CalendarItem[] | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    calendarService
      .items(profile.id, addDays(today, -30), addDays(today, 7))
      .then((r) => !cancelled && setItems(r))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [profile, today])

  const agenda = useMemo(() => sortDay((items ?? []).filter((i) => i.day === today && i.kind !== 'holiday' && i.kind !== 'leave')), [items, today])
  const late = useMemo(() => overdue(items ?? [], today), [items, today])
  const collections = useMemo(() => (items ?? []).filter((i) => i.kind === 'collect' && !i.done && i.day >= today), [items, today])
  const owed = collections.reduce((a, i) => a + (i.amount ?? 0), 0)
  const clockedIn = attendance === 'CLOCKED_IN'
  const name = profile ? displayName(profile.full_name, profile.nickname).split(' ')[0] : ''
  const shortcuts = forYou(group, ctx)

  const open = (i: CalendarItem) => {
    if (i.kind === 'leave') return navigate('/leave')
    if (i.customer_id) return navigate(`/customers/${i.customer_id}`)
    navigate('/calendar')
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1 md:max-w-3xl md:px-8">
      <p className="text-[14px] text-neutral-600">
        {greeting()}
        {name ? `, ${name}` : ''} — {agenda.length ? `${agenda.length} on your agenda today` : 'nothing on your agenda yet'}
      </p>

      <Link to="/check-in" className={`flex items-center gap-3 rounded-2xl p-3.5 text-white ${clockedIn ? 'bg-brand-900' : 'bg-brand-500'}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Clock className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold">{clockedIn ? 'Clocked in' : 'Clock in to start your day'}</span>
          <span className="block text-[12.5px] text-white/80">{clockedIn ? 'Open Check In for your day so far' : 'Selfie and location'}</span>
        </span>
        <span className="rounded-full bg-white px-3 py-1.5 text-[13px] font-extrabold text-brand-700">{clockedIn ? 'Open' : 'Clock in'}</span>
      </Link>

      <div className="rounded-2xl bg-white px-3.5 pb-1 pt-3 shadow-card">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">
            Agenda · {agenda.length} today{late.length ? ` · ${late.length} overdue` : ''}
          </p>
          <Link to="/calendar" className="text-[13px] font-bold text-brand-600">
            Calendar ›
          </Link>
        </div>
        {items === null && <div className="my-2 h-16 animate-pulse rounded-xl bg-neutral-100" />}
        {items && agenda.length === 0 && late.length === 0 && <p className="py-3 text-[13.5px] text-neutral-500">Nothing today. Tasks, collections and follow-ups show up here.</p>}
        {[...late.slice(0, 3), ...agenda].map((i, n) => (
          <button key={`${i.kind}-${i.ref_id}-${i.day}`} type="button" onClick={() => open(i)} className={`flex w-full items-center gap-2.5 py-2.5 text-left ${n ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="w-11 shrink-0 text-[12.5px] font-extrabold tabular-nums text-neutral-600">{i.day < today ? 'Late' : hhmm(i.at_time)}</span>
            <span className={`w-1 self-stretch rounded-full ${KIND[i.kind].dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-neutral-900">{itemTitle(i)}</span>
              <span className="block truncate text-xs text-neutral-500">
                <span className={`font-bold ${KIND[i.kind].text}`}>{KIND[i.kind].label}</span>
                {itemSub(i) ? ` · ${itemSub(i)}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/calendar" className="rounded-2xl bg-white p-3.5 shadow-card">
          <p className="text-[11.5px] font-bold text-neutral-500">To collect · 7 days</p>
          <p className="mt-0.5 text-[22px] font-extrabold text-status-danger">{owed ? money(owed) : collections.length}</p>
          <p className="text-[12px] text-neutral-500">{collections.length} collection{collections.length === 1 ? '' : 's'}</p>
        </Link>
        <Link to="/messages" className="rounded-2xl bg-white p-3.5 shadow-card">
          <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-neutral-500">
            <MessagesSquare className="h-3.5 w-3.5" aria-hidden /> Messages
          </p>
          <p className="mt-0.5 text-[22px] font-extrabold text-brand-600">{unreadCount}</p>
          <p className="text-[12px] text-neutral-500">unread</p>
        </Link>
      </div>

      {shortcuts.length > 0 && (
        <div className="grid grid-cols-4 gap-2 pt-1">
          {shortcuts.map((r) => (
            <Link key={r.key} to={r.to} className="flex flex-col items-center gap-1.5">
              <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white ${r.tone}`}>
                <r.icon className="h-[22px] w-[22px]" aria-hidden />
              </span>
              <span className="text-center text-[12px] font-semibold leading-tight text-neutral-600">{r.label}</span>
            </Link>
          ))}
        </div>
      )}

      <Link to="/report" className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-card">
        <span className="text-[14px] font-bold text-neutral-900">My numbers</span>
        <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
      </Link>
    </div>
  )
}
