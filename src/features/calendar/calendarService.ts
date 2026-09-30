import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/rpc'

export type CalendarKind = 'task' | 'appt' | 'collect' | 'follow' | 'plan' | 'leave' | 'holiday'

/** One row of calendar_items (0098). Declared by hand: the generated RPC types mark every column non-null. */
export interface CalendarItem {
  kind: CalendarKind
  ref_id: string
  day: string
  at_time: string | null
  title: string
  customer_id: string | null
  customer_name: string | null
  done: boolean
  amount: number | null
  source_date: string | null
  source_label: string | null
  assigned_by: string | null
  can_edit: boolean
  sort_order: number
}

export interface TaskRow {
  id: string
  owner_id: string
  created_by: string
  title: string
  note: string | null
  due_date: string
  due_time: string | null
  customer_id: string | null
  done_at: string | null
}

export interface TaskInput {
  id: string | null
  ownerId: string
  title: string
  dueDate: string
  dueTime: string | null
  note: string
  customerId: string | null
}

export interface TeamPerson {
  id: string
  full_name: string
  nickname: string | null
}

/**
 * The Calendar: one feed per person built in the database from tasks, visit
 * appointments and collections, call follow-ups, Today's plan, leave and
 * holidays (calendar_items), plus task writes and "tick off" calls.
 */
export const calendarService = {
  items(userId: string, from: string, to: string): Promise<CalendarItem[]> {
    return callRpc<CalendarItem[]>('calendar_items', { p_user: userId, p_from: from, p_to: to }).then((r) => r ?? [])
  },

  async task(id: string): Promise<TaskRow | null> {
    const { data, error } = await supabase.from('tasks' as never).select('id, owner_id, created_by, title, note, due_date, due_time, customer_id, done_at').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as TaskRow | null) ?? null
  },

  saveTask(t: TaskInput): Promise<string> {
    return callRpc<string>('save_task', {
      p_id: t.id,
      p_owner: t.ownerId,
      p_title: t.title,
      p_due_date: t.dueDate,
      p_due_time: t.dueTime || null,
      p_note: t.note || null,
      p_customer: t.customerId,
    })
  },

  completeTask(id: string, done: boolean): Promise<void> {
    return callRpc<void>('complete_task', { p_id: id, p_done: done })
  },

  deleteTask(id: string): Promise<void> {
    return callRpc<void>('delete_task', { p_id: id })
  },

  /** Ticks off an item that came from somewhere else: a visit's appointment/collection, or a call follow-up. */
  completeSource(item: CalendarItem, done: boolean): Promise<void> {
    if (item.kind === 'task') return calendarService.completeTask(item.ref_id, done)
    if (fromVisit(item)) return callRpc<void>('complete_visit_follow_up', { p_visit: item.ref_id, p_done: done })
    return callRpc<void>('complete_follow_up', { p_post_id: item.ref_id, p_done: done })
  },

  team(): Promise<TeamPerson[]> {
    return callRpc<TeamPerson[]>('my_team').then((r) => (r ?? []).map((p) => ({ id: p.id, full_name: p.full_name, nickname: p.nickname })))
  },
}

/** Appointments, and collections a visit left behind, come from visits; other collections and follow-ups from calls/notes. */
export function fromVisit(item: Pick<CalendarItem, 'kind' | 'source_label'>): boolean {
  return item.kind === 'appt' || (item.kind === 'collect' && (item.source_label === 'Part paid' || item.source_label === 'Nothing collected'))
}
