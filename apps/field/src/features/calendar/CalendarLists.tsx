import { Link } from 'react-router-dom'
import { Check, Clock, Plus } from 'lucide-react'
import { shortDay } from '@/features/customers/book'
import { fromVisit, type CalendarItem } from './calendarService'
import { addDays, checkable, hhmm, itemSub, itemTitle } from './calendar'

const card = 'rounded-[18px] border border-neutral-100 bg-white shadow-card'
const kicker = 'px-0.5 pb-2 text-xs font-bold uppercase tracking-[0.06em]'
const key = (i: CalendarItem) => `${i.kind}-${i.ref_id}-${i.day}`
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** One list from overlapping ranges (the same item can come back from both). */
export function mergeItems(...lists: CalendarItem[][]): CalendarItem[] {
  const seen = new Map<string, CalendarItem>()
  for (const list of lists) for (const i of list) seen.set(key(i), i)
  return [...seen.values()]
}

type Group = 'over' | 'today' | 'week' | 'later' | 'done'
const GROUPS: [Group, string, string][] = [
  ['over', 'Overdue', 'text-status-danger'],
  ['today', 'Today', 'text-status-warn'],
  ['week', 'This week', 'text-neutral-500'],
  ['later', 'Later', 'text-neutral-500'],
  ['done', 'Done', 'text-neutral-500'],
]

function groupOf(i: CalendarItem, today: string): Group {
  if (i.done) return 'done'
  if (i.day < today) return 'over'
  if (i.day === today) return 'today'
  return i.day <= addDays(today, 6) ? 'week' : 'later'
}

/** To-dos with a done box (tasks, collections, call follow-ups), not yet done. */
export function openTasks(items: CalendarItem[]): CalendarItem[] {
  return items.filter((i) => checkable(i.kind) && !i.done)
}

/**
 * Calendar › Tasks (canvas Polish › Calendar, Tasks tab): every to-do with
 * a done box, grouped Overdue / Today / This week / Later, then what was
 * done in the last week.
 */
export function TaskGroups({ items, today, readOnly, onToggle, onOpen, onAdd, addLabel }: { items: CalendarItem[]; today: string; readOnly: boolean; onToggle: (i: CalendarItem) => void; onOpen: (i: CalendarItem) => void; onAdd: () => void; addLabel: string }) {
  const weekAgo = addDays(today, -7)
  const todos = items
    .filter((i) => checkable(i.kind) && (!i.done || i.day >= weekAgo))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.at_time ?? '99').localeCompare(b.at_time ?? '99') || a.sort_order - b.sort_order)
  const groups = GROUPS.map(([g, title, color]) => ({ g, title, color, list: todos.filter((i) => groupOf(i, today) === g) })).filter((x) => x.list.length)
  const due = (i: CalendarItem, g: Group) => {
    const time = i.at_time ? ` · ${hhmm(i.at_time)}` : ''
    if (g === 'done') return `Done · was due ${i.day === today ? 'today' : shortDay(i.day)}`
    if (g === 'over') return `Due ${shortDay(i.day)}`
    if (g === 'today') return `Today${time}`
    return `${shortDay(i.day)}${time}`
  }
  /** The customer and source, without repeating a customer already in the title. */
  const sub = (i: CalendarItem) => {
    const s = itemSub(i)
    const t = itemTitle(i)
    return s.startsWith(`${t} · `) ? s.slice(t.length + 3) : s === t ? '' : s
  }
  const dueColor: Record<Group, string> = { over: 'text-status-danger', today: 'text-status-warn', week: 'text-neutral-600', later: 'text-neutral-600', done: 'text-neutral-500' }

  return (
    <div className="space-y-3.5">
      {groups.length === 0 && <p className={`${card} p-5 text-center text-[13.5px] text-neutral-500`}>No tasks. Add one, or they’ll appear here from visits and calls.</p>}
      {groups.map(({ g, title, color, list }) => (
        <section key={g} aria-label={title}>
          <p className={`${kicker} ${color}`}>
            {title} · {list.length}
          </p>
          <div className={`${card} px-3.5`}>
            {list.map((i, idx) => (
              <div key={key(i)} className={`flex items-start gap-3 py-3 ${idx ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={i.done}
                  aria-label={`${i.done ? 'Mark not done' : 'Mark done'}: ${itemTitle(i)}`}
                  disabled={readOnly && !i.can_edit}
                  onClick={() => onToggle(i)}
                  className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-white disabled:opacity-35 ${i.done ? 'border-status-working bg-status-working' : g === 'over' ? 'border-status-danger' : 'border-neutral-300 dark:border-neutral-600'}`}
                >
                  {i.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </button>
                <button type="button" onClick={() => onOpen(i)} className="min-w-0 flex-1 text-left">
                  <span className={`block text-sm font-bold ${i.done ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>{itemTitle(i)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
                    <span className={`font-bold ${dueColor[g]}`}>{due(i, g)}</span>
                    {sub(i) && <span>{sub(i)}</span>}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
      <button type="button" onClick={onAdd} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-neutral-300 text-sm font-bold text-brand-500 dark:border-neutral-600">
        <Plus className="h-4 w-4" aria-hidden /> {addLabel}
      </button>
    </div>
  )
}

/** Appointments set at visits (a collection when money was still owed), today onwards. */
export function appointments(items: CalendarItem[], today: string): CalendarItem[] {
  return items.filter((i) => (i.kind === 'appt' || i.kind === 'collect') && fromVisit(i) && i.day >= today)
}

/**
 * Calendar › Appointments (canvas Polish › Calendar, Appointments tab):
 * what's coming up as date-tile cards, then today's that are already past.
 */
export function ApptList({ items, today, nowHHMM }: { items: CalendarItem[]; today: string; nowHHMM: string }) {
  const all = appointments(items, today).sort((a, b) => a.day.localeCompare(b.day) || (a.at_time ?? '').localeCompare(b.at_time ?? ''))
  const isPast = (i: CalendarItem) => i.done || (i.day === today && !!i.at_time && i.at_time.slice(0, 5) < nowHHMM)
  const coming = all.filter((i) => !isPast(i))
  const earlier = all.filter((i) => i.day === today && isPast(i))
  const when = (day: string) => {
    const n = daysBetween(today, day)
    return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n <= 6 ? `In ${n} days` : n <= 13 ? 'Next week' : shortDay(day)
  }

  return (
    <div className="space-y-2.5">
      <p className={`${kicker} !pb-0 text-neutral-500`}>Coming up · {coming.length}</p>
      {coming.length === 0 && <p className={`${card} p-5 text-center text-[13.5px] text-neutral-500`}>No appointments coming up. Set the next one when you check out of a visit.</p>}
      {coming.map((i) => {
        const [dow, d] = shortDay(i.day).split(' ')
        const soon = daysBetween(today, i.day) <= 1
        return (
          <article key={key(i)} className={`${card} flex gap-3 px-3.5 py-3`}>
            <span className="w-12 shrink-0 self-start overflow-hidden rounded-xl border border-neutral-100 text-center dark:border-neutral-800">
              <span className="block bg-brand-500 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">{dow}</span>
              <span className="block pt-0.5 text-[19px] font-extrabold leading-[22px] text-neutral-900">{d}</span>
              <span className="block pb-1 text-[10px] font-bold text-neutral-500">{i.at_time ? hhmm(i.at_time) : 'Any time'}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-extrabold text-neutral-900">{i.customer_name ?? i.title}</span>
                <span className={`shrink-0 text-[11px] font-bold ${soon ? 'text-status-warn' : 'text-neutral-500'}`}>{when(i.day)}</span>
              </span>
              <span className="mt-0.5 block text-[13px] font-semibold text-neutral-700">{i.kind === 'collect' ? itemTitle(i) : 'Visit appointment'}</span>
              <span className="mt-0.5 block text-xs text-neutral-500">{i.source_date ? `Set at the visit on ${shortDay(i.source_date)}` : 'Set at a visit'}</span>
              {i.customer_id && (
                <span className="mt-2.5 flex gap-1.5">
                  <Link to={`/customers/${i.customer_id}`} className="inline-flex h-[30px] items-center rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">
                    Customer
                  </Link>
                  <Link to={`/customers/${i.customer_id}?tab=cal`} className="inline-flex h-[30px] items-center rounded-full border border-neutral-200 px-3 text-xs font-bold text-neutral-900 dark:border-neutral-700">
                    Their calendar
                  </Link>
                </span>
              )}
            </span>
          </article>
        )
      })}
      {earlier.length > 0 && (
        <>
          <p className={`${kicker} !pb-0 pt-1.5 text-neutral-500`}>Earlier today</p>
          {earlier.map((i) => (
            <div key={key(i)} className={`${card} flex items-center gap-3 px-3.5 py-3`}>
              <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${i.done ? 'bg-status-working/10 text-status-working' : 'bg-neutral-100 text-neutral-500'}`}>
                {i.done ? <Check className="h-[17px] w-[17px]" strokeWidth={2.4} aria-hidden /> : <Clock className="h-[17px] w-[17px]" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-neutral-900">
                  {i.customer_name ?? i.title} · {hhmm(i.at_time)}
                </span>
                <span className="block truncate text-xs text-neutral-500">{i.done ? 'Visited' : 'Not visited yet'}</span>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
