import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { displayName } from '@/lib/displayName'
import { localDay, shortDay } from '@/features/customers/book'
import { orgErrorText } from '@/features/org/org'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { calendarService, type CalendarItem, type TeamPerson } from '@/features/calendar/calendarService'
import { FILTERS, KIND, addDays, byDay, checkable, hhmm, isAuto, itemSub, itemTitle, monthGrid, passes, type CalendarFilter } from '@/features/calendar/calendar'
import { TaskSheet } from '@/features/calendar/TaskSheet'
import { ApptList, TaskGroups, appointments, mergeItems, openTasks } from '@/features/calendar/CalendarLists'
import { AdminTabs } from '@/components/AdminKit'
import { useTab } from '@/hooks/useTab'
import { formatTime } from '@/lib/datetime'

/** Items for one person and date range; keeps the last result on screen while the next loads. */
function useItems(userId: string | null, from: string, to: string, nonce: number) {
  const [state, setState] = useState<{ items: CalendarItem[]; loading: boolean; error: string | null }>({ items: [], loading: true, error: null })
  const seq = useRef(0)
  useEffect(() => {
    if (!userId) return
    const mine = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    calendarService
      .items(userId, from, to)
      .then((items) => mine === seq.current && setState({ items, loading: false, error: null }))
      .catch((e) => mine === seq.current && setState((s) => ({ ...s, loading: false, error: orgErrorText(e) })))
  }, [userId, from, to, nonce])
  return [state, setState] as const
}

/**
 * Calendar (Hub › Calendar): everything dated for one person -- their
 * tasks, and, added automatically, visit appointments, collections, call
 * follow-ups, Today's plan stops, leave and holidays. Managers can open a
 * team member's calendar and assign them tasks. On a phone it has three
 * tabs as on the canvas (Polish › Calendar): the month, Tasks (grouped
 * Overdue / Today / This week) and Appointments coming up.
 */
export function CalendarPage() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const me = profile?.id ?? null
  const today = localDay(new Date().toISOString())
  const [person, setPerson] = useState<string | null>(null)
  const who = person ?? me
  const [team, setTeam] = useState<TeamPerson[]>([])
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [selected, setSelected] = useState(today)
  const [filter, setFilter] = useState<CalendarFilter>('all')
  const [nonce, setNonce] = useState(0)
  const [sheet, setSheet] = useState<{ taskId: string | null; customerName?: string | null } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useTab(['calendar', 'tasks', 'appts'] as const, 'calendar')

  useEffect(() => {
    calendarService
      .team()
      .then((t) => setTeam(t.filter((p) => p.id !== me)))
      .catch(() => setTeam([]))
  }, [me])

  const grid = monthGrid(ym.y, ym.m)
  const [month, setMonth] = useItems(who, grid.from, grid.to, nonce)
  const [recent, setRecent] = useItems(who, addDays(today, -30), today, nonce)
  const [ahead, setAhead] = useItems(who, today, addDays(today, 60), nonce)
  const listItems = useMemo(() => mergeItems(recent.items, ahead.items), [recent.items, ahead.items])
  const days = useMemo(() => byDay(month.items.filter((i) => passes(i, filter))), [month.items, filter])
  const all = useMemo(() => byDay(month.items), [month.items])
  const dayItems = days.get(selected) ?? []
  const nowHHMM = formatTime(new Date().toISOString())
  const apptCount = appointments(listItems, today).filter((i) => !i.done && !(i.day === today && i.at_time && i.at_time.slice(0, 5) < nowHHMM)).length
  const viewingOther = !!who && who !== me
  const whoName = viewingOther ? displayName(team.find((p) => p.id === who)?.full_name ?? 'them', team.find((p) => p.id === who)?.nickname) : 'Me'

  async function toggle(item: CalendarItem) {
    const next = !item.done
    const flip = (list: CalendarItem[]) => list.map((i) => (i.ref_id === item.ref_id && i.kind === item.kind ? { ...i, done: next } : i))
    setMonth((s) => ({ ...s, items: flip(s.items) }))
    setRecent((s) => ({ ...s, items: flip(s.items) }))
    setAhead((s) => ({ ...s, items: flip(s.items) }))
    setActionError(null)
    try {
      await calendarService.completeSource(item, next)
    } catch (e) {
      setActionError(orgErrorText(e))
      setNonce((n) => n + 1)
    }
  }

  function open(item: CalendarItem) {
    if (item.kind === 'task') return setSheet({ taskId: item.ref_id, customerName: item.customer_name })
    if (item.kind === 'leave') return navigate('/leave')
    if (item.kind === 'trip') return navigate(`/trips/${item.ref_id}`)
    if (item.customer_id) return navigate(`/customers/${item.customer_id}`)
  }

  const shift = (delta: number) => setYm(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }))
  const goToday = () => {
    setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
    setSelected(today)
  }

  const personPicker = team.length > 0 && (
    <select
      aria-label="Whose calendar"
      value={who ?? ''}
      onChange={(e) => {
        setPerson(e.target.value === me ? null : e.target.value)
        setNonce((n) => n + 1)
      }}
      className="h-9 rounded-full border-[1.5px] border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-900"
    >
      <option value={me ?? ''}>My calendar</option>
      {team.map((p) => (
        <option key={p.id} value={p.id}>
          {displayName(p.full_name, p.nickname)}
        </option>
      ))}
    </select>
  )

  const filters = (
    <div role="radiogroup" aria-label="Show" className="flex gap-1.5 overflow-x-auto pb-0.5">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="radio"
          aria-checked={filter === f.key}
          onClick={() => setFilter(f.key)}
          className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-bold ${
            filter === f.key ? 'border-brand-500 bg-brand-50 text-brand-500' : 'border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          {f.dot && <span className={`h-2 w-2 rounded-full ${f.dot}`} />}
          {f.label}
        </button>
      ))}
    </div>
  )

  const monthNav = (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[140px] text-center text-[15px] font-extrabold text-neutral-900">{grid.label}</span>
      <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600">
        <ChevronRight className="h-4 w-4" />
      </button>
      <button type="button" onClick={goToday} className="h-9 rounded-full border border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-600">
        Today
      </button>
      {month.loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" aria-label="Loading" />}
    </div>
  )

  const dayPanel = (
    <div className="rounded-2xl border border-neutral-100 bg-white px-3.5 py-1 shadow-card">
      <p className="mb-1 mt-3 text-[13px] font-extrabold text-neutral-900">
        {shortDay(selected)}
        {selected === today ? ' · Today' : ''} <span className="font-semibold text-neutral-500">· {dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}</span>
      </p>
      {dayItems.map((i, idx) => (
        <ItemRow key={`${i.kind}-${i.ref_id}-${i.day}`} item={i} first={idx === 0} today={today} onToggle={() => toggle(i)} onOpen={() => open(i)} readOnly={viewingOther && !i.can_edit} />
      ))}
      {dayItems.length === 0 && <p className="py-5 text-center text-[13.5px] text-neutral-500">Nothing on {shortDay(selected)}.</p>}
    </div>
  )

  const errors = [month.error, recent.error, ahead.error, actionError].filter(Boolean)
  const sheetEl = me && (
    <TaskSheet
      open={!!sheet}
      onClose={() => setSheet(null)}
      taskId={sheet?.taskId ?? null}
      customerName={sheet?.customerName}
      defaultDate={selected < today ? today : selected}
      defaultOwner={who ?? me}
      meId={me}
      team={team}
      onSaved={() => setNonce((n) => n + 1)}
    />
  )
  const addLabel = viewingOther ? `Task for ${whoName.split(' ')[0]}` : 'Task'

  if (desktop) {
    return (
      <div className="flex flex-col gap-3 px-6 pb-8 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          {monthNav}
          <div className="flex-1" />
          {personPicker}
          <button type="button" onClick={() => setSheet({ taskId: null })} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-500 px-4 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> {addLabel}
          </button>
        </div>
        {filters}
        {errors.map((e) => (
          <p key={e} className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {e}
          </p>
        ))}
        <div className="flex gap-4">
          <div className="min-w-0 flex-1 overflow-hidden rounded-[14px] bg-white shadow-card">
            <div className="grid grid-cols-7 border-b border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d} className="px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-neutral-500">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.days.map((d) => {
                const items = days.get(d.date) ?? []
                const off = (all.get(d.date) ?? []).find((i) => i.kind === 'holiday' || i.kind === 'leave')
                const sel = d.date === selected
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelected(d.date)}
                    aria-label={`${shortDay(d.date)}, ${items.length} items`}
                    className={`flex h-[118px] flex-col gap-0.5 overflow-hidden border-b border-r border-neutral-100 p-1.5 text-left dark:border-neutral-800 ${sel ? 'bg-brand-50' : off ? (off.kind === 'holiday' ? 'holiday-stripes' : 'bg-neutral-100') : ''} ${d.inMonth ? '' : 'opacity-45'}`}
                  >
                    <span className={`flex h-6 min-w-[24px] items-center justify-center self-start rounded-full px-1.5 text-[12.5px] ${d.date === today ? 'font-extrabold text-brand-500 ring-2 ring-inset ring-brand-500' : 'font-semibold text-neutral-700'}`}>{d.day}</span>
                    {items.slice(0, 3).map((i) => (
                      <span key={`${i.kind}-${i.ref_id}`} className={`truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ${KIND[i.kind].chip} ${i.done ? 'line-through opacity-70' : ''}`}>
                        {i.at_time ? `${hhmm(i.at_time)} ` : ''}
                        {itemTitle(i)}
                      </span>
                    ))}
                    {items.length > 3 && <span className="text-[11px] font-bold text-neutral-500">+{items.length - 3} more</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="w-[340px] shrink-0">
            {dayPanel}
            {viewingOther && <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[12.5px] text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">You’re viewing {whoName}’s calendar. Tasks you assign can be changed here; the rest is read-only.</p>}
          </div>
        </div>
        {sheetEl}
      </div>
    )
  }

  const addTask = () => setSheet({ taskId: null })
  return (
    <div className="mx-auto max-w-lg px-4 pb-40 pt-3">
      <div className="flex flex-col gap-3">
        <AdminTabs
          tabs={[
            ['calendar', 'Calendar'],
            ['tasks', `Tasks · ${openTasks(listItems).length}`],
            ['appts', `Appointments · ${apptCount}`],
          ]}
          value={tab}
          onChange={setTab}
        />
        {personPicker && <div className="flex justify-end">{personPicker}</div>}
        {viewingOther && <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">Viewing {whoName}’s calendar. You can add or change tasks you assign; everything else is read-only.</p>}
        {errors.map((e) => (
          <p key={e} className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {e}
          </p>
        ))}

        {tab === 'calendar' && (
          <>
            <div className="rounded-2xl border border-neutral-100 bg-white px-2.5 py-3 shadow-card">
              <div className="flex items-center justify-between px-1 pb-2.5">
                <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={goToday} className="flex items-center gap-1.5 text-base font-extrabold text-neutral-900">
                  {grid.label}
                  {month.loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />}
                </button>
                <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-center text-[11px] font-extrabold text-neutral-500">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {grid.days.map((d) => {
                  const items = days.get(d.date) ?? []
                  const dayAll = all.get(d.date) ?? []
                  const hol = dayAll.some((i) => i.kind === 'holiday')
                  const leave = dayAll.some((i) => i.kind === 'leave')
                  const kinds = [...new Set(items.filter((i) => i.kind !== 'holiday' && i.kind !== 'leave').map((i) => i.kind))].slice(0, 4)
                  const sel = d.date === selected
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setSelected(d.date)}
                      aria-label={`${shortDay(d.date)}, ${items.length} items${leave ? ', leave' : ''}${hol ? ', holiday' : ''}`}
                      aria-pressed={sel}
                      className={`flex h-[50px] flex-col items-center justify-center gap-1 rounded-xl ${hol ? 'holiday-stripes' : leave ? 'bg-neutral-100' : ''} ${d.inMonth ? '' : 'opacity-40'}`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                          sel
                            ? 'bg-brand-500 font-bold text-white'
                            : d.date === today
                              ? 'font-bold text-brand-500 ring-2 ring-inset ring-brand-500'
                              : d.date < today
                                ? 'font-medium text-neutral-500'
                                : 'font-medium text-neutral-900'
                        }`}
                      >
                        {d.day}
                      </span>
                      <span className="flex h-1.5 gap-[3px]">
                        {kinds.map((k) => (
                          <span key={k} className={`h-1.5 w-1.5 rounded-full ${KIND[k].dot}`} />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-neutral-100 px-1 pt-2.5 text-xs text-neutral-500 dark:border-neutral-800">
                {(['appt', 'task', 'plan'] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${KIND[k].dot}`} /> {k === 'appt' ? 'Appointment' : KIND[k].label.replace(' stop', '')}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-3.5 rounded-[3px] bg-neutral-100 ring-1 ring-inset ring-neutral-200 dark:ring-neutral-700" /> Leave
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="holiday-stripes h-2.5 w-3.5 rounded-[3px]" /> Holiday
                </span>
              </div>
            </div>
            {dayPanel}
            <p className="mx-1 flex gap-1.5 text-xs leading-relaxed text-neutral-500">
              <span className="h-[18px] shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[10.5px] font-extrabold text-neutral-500 dark:bg-neutral-800">Auto</span>
              Added for you: a visit’s next appointment (a collection when money is still owed) and a call’s follow-up date. Collections tick themselves off when a later visit or call records the payment.
            </p>
          </>
        )}
        {tab === 'tasks' && <TaskGroups items={listItems} today={today} readOnly={viewingOther} onToggle={toggle} onOpen={open} onAdd={addTask} addLabel={`Add ${addLabel.toLowerCase()}`} />}
        {tab === 'appts' && <ApptList items={listItems} today={today} nowHHMM={nowHHMM} />}
      </div>

      {tab === 'calendar' && (
        <button
          type="button"
          onClick={addTask}
          className="fixed bottom-24 right-4 z-20 flex h-[52px] items-center gap-2 rounded-full bg-brand-500 px-5 text-[15px] font-extrabold text-white md:bottom-8"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> {addLabel}
        </button>
      )}
      {sheetEl}
    </div>
  )
}

function ItemRow({ item, first, today, onToggle, onOpen, readOnly }: { item: CalendarItem; first: boolean; today: string; onToggle: () => void; onOpen: () => void; readOnly: boolean }) {
  const k = KIND[item.kind]
  const canCheck = checkable(item.kind)
  const late = canCheck && !item.done && item.day < today
  return (
    <div className={`flex items-center gap-2.5 py-2.5 ${first ? '' : 'border-t border-neutral-100 dark:border-neutral-800'}`}>
      <span className="w-11 shrink-0 text-[12.5px] font-extrabold tabular-nums text-neutral-600">{hhmm(item.at_time)}</span>
      {canCheck ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          aria-label={item.done ? 'Mark not done' : 'Mark done'}
          disabled={readOnly || !item.can_edit}
          onClick={onToggle}
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 disabled:opacity-35 ${item.done ? `border-transparent ${k.dot} text-white` : 'border-neutral-300'}`}
        >
          {item.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
        </button>
      ) : (
        <span className={`h-[22px] w-[22px] shrink-0 rounded-[7px] ${k.chip} flex items-center justify-center`}>
          <span className={`h-2 w-2 rounded-full ${k.dot}`} />
        </span>
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-bold ${item.done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{itemTitle(item)}</span>
          {late && <span className="shrink-0 rounded-full bg-status-danger/10 px-1.5 py-px text-[10.5px] font-extrabold text-status-danger">Overdue</span>}
          {isAuto(item.kind) && <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[10.5px] font-extrabold text-neutral-500 dark:bg-neutral-800">Auto</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">
          <span className={`font-bold ${k.text}`}>{k.label}</span>
          {itemSub(item) ? ` · ${itemSub(item)}` : ''}
        </span>
      </button>
    </div>
  )
}
