import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Switch } from '@/components/Switch'
import { displayName } from '@/lib/displayName'
import { customerBookService, type BookRow } from '@/features/customers/customerBookService'
import { useDebounced } from '@/features/customers/useCustomerBook'
import { orgErrorText } from '@/features/org/org'
import { calendarService, type TeamPerson } from './calendarService'

export interface Assignee {
  id: string
  name: string
}

const input = 'w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400'

/**
 * Add or edit a task. People with a team (managers) pick who it's for; a
 * task someone assigned to you can be ticked and edited, and only its
 * creator can delete it.
 */
export function TaskSheet({
  open,
  onClose,
  taskId,
  defaultDate,
  defaultOwner,
  meId,
  team,
  customerName,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  taskId: string | null
  defaultDate: string
  /** Whose calendar is open -- the default "for". */
  defaultOwner: string
  meId: string
  team: TeamPerson[]
  /** The task's customer name, from the calendar item (saves a lookup). */
  customerName?: string | null
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [owner, setOwner] = useState(defaultOwner)
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null)
  const [done, setDone] = useState(false)
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim())
  const [results, setResults] = useState<BookRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setQuery('')
    setResults([])
    if (!taskId) {
      setTitle('')
      setDate(defaultDate)
      setTime('')
      setNote('')
      setOwner(defaultOwner)
      setCustomer(null)
      setDone(false)
      setCreatedBy(meId)
      return
    }
    setLoading(true)
    calendarService
      .task(taskId)
      .then((t) => {
        if (!t) return setError('This task no longer exists.')
        setTitle(t.title)
        setDate(t.due_date)
        setTime(t.due_time?.slice(0, 5) ?? '')
        setNote(t.note ?? '')
        setOwner(t.owner_id)
        setDone(!!t.done_at)
        setCreatedBy(t.created_by)
        setCustomer(t.customer_id ? { id: t.customer_id, name: customerName ?? 'Customer' } : null)
      })
      .catch((e) => setError(orgErrorText(e)))
      .finally(() => setLoading(false))
  }, [open, taskId, defaultDate, defaultOwner, meId, customerName])

  useEffect(() => {
    if (!search || customer) return setResults([])
    let cancelled = false
    customerBookService
      .page({ search, limit: 6, sort: 'name' })
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]))
    return () => {
      cancelled = true
    }
  }, [search, customer])

  const people: Assignee[] = [{ id: meId, name: 'Me' }, ...team.filter((p) => p.id !== meId).map((p) => ({ id: p.id, name: displayName(p.full_name, p.nickname) }))]
  const canAssign = team.some((p) => p.id !== meId)
  const mine = !taskId || createdBy === meId
  const ownerName = people.find((p) => p.id === owner)?.name ?? 'them'

  async function save() {
    if (!title.trim()) return setError('Say what needs doing.')
    if (!date) return setError('Pick a date.')
    setSaving(true)
    setError(null)
    try {
      await calendarService.saveTask({ id: taskId, ownerId: owner, title: title.trim(), dueDate: date, dueTime: time || null, note, customerId: customer?.id ?? null })
      if (taskId) await calendarService.completeTask(taskId, done)
      onSaved()
      onClose()
    } catch (e) {
      setError(orgErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!taskId) return
    setSaving(true)
    try {
      await calendarService.deleteTask(taskId)
      onSaved()
      onClose()
    } catch (e) {
      setError(orgErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={taskId ? 'Task' : 'New task'}>
      <div className="flex flex-col gap-3.5 px-5 py-4">
        {loading && <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />}
        {taskId && !mine && createdBy && (
          <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">Assigned to you. Whoever assigned it sees when it’s done.</p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-neutral-600">What needs doing</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Collect the signed contract" autoFocus={!taskId} className={input} />
        </label>
        <div className="grid grid-cols-[1.3fr_1fr] gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-neutral-600">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-neutral-600">
              Time <span className="font-medium text-neutral-400">(optional)</span>
            </span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-neutral-600">
            Customer <span className="font-medium text-neutral-400">(optional)</span>
          </span>
          {customer ? (
            <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2.5">
              <span className="flex-1 truncate text-[15px] text-neutral-900">{customer.name}</span>
              <button type="button" onClick={() => setCustomer(null)} aria-label="Remove customer" className="text-neutral-400">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3">
                <Search className="h-4 w-4 text-neutral-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers" aria-label="Search customers" className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400" />
              </label>
              {results.length > 0 && (
                <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800">
                  {results.map((r) => (
                    <button key={r.customer_id} type="button" onClick={() => setCustomer({ id: r.customer_id, name: r.shop_name })} className="block w-full px-3 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-50">
                      {r.shop_name}
                      {r.district && <span className="text-neutral-500"> · {r.district}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {canAssign && mine && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-neutral-600">For</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">{owner === meId ? 'Only you will see this task.' : `It goes on ${ownerName}’s calendar, and you’ll see when it’s done.`}</span>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-neutral-600">
            Note <span className="font-medium text-neutral-400">(optional)</span>
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} />
        </label>
        {taskId && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">Done</span>
            <Switch checked={done} onChange={setDone} label="Done" />
          </div>
        )}
        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
        <div className="flex gap-2">
          {taskId && mine && (
            <button type="button" onClick={remove} disabled={saving} className="h-12 rounded-2xl border-[1.5px] border-neutral-200 px-4 text-[15px] font-bold text-status-danger">
              Delete
            </button>
          )}
          <button type="button" onClick={save} disabled={saving || loading} className="h-12 flex-1 rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white disabled:opacity-60">
            {saving ? 'Saving…' : !taskId ? (owner === meId ? 'Add task' : 'Assign task') : 'Save'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
