import { FIELDS, MAX_CONTACTS, ORDER_COLUMNS, normHeader, type ContactSlot, type FieldKey, type TabConfig } from '../../../supabase/functions/sheet-sync/parse'

export { FIELDS, MAX_CONTACTS, ORDER_COLUMNS, type ContactSlot, type FieldKey, type TabConfig }

/** The sale order tab: synced after the customer tabs with fixed SO columns. */
export interface OrderTab {
  url: string
  tab: string | null
}

export interface OrderCounts {
  read: number
  valid: number
  created: number
  updated: number
  unchanged: number
  cancelled: number
  skipped: number
}

export type Schedule = 'off' | 'hourly' | 'every6h' | 'daily' | 'weekly'
export type DateOrder = 'dmy' | 'mdy'

export interface SheetSyncSettings {
  tabs: TabConfig[]
  orders: OrderTab | null
  date_order: DateOrder
  schedule: Schedule
  at_time: string
  weekday: number
  next_run_at: string | null
  last_synced_at: string | null
}

export interface SheetSyncRun {
  id: string
  trigger: 'manual' | 'schedule' | 'preview'
  started_by: string | null
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'partial' | 'failed'
  rows_read: number
  updated: number
  created: number
  unchanged: number
  skipped: number
  contacts_updated: number
  contacts_created: number
  orders: Partial<OrderCounts>
  errors: { tab: number; row: number; reason: string }[]
  message: string | null
}

export interface SyncResult {
  ok: boolean
  run_id?: string
  status?: SheetSyncRun['status']
  error?: string
  counts?: { rows_read: number; updated: number; created: number; unchanged: number; skipped: number; contacts_updated?: number; contacts_created?: number; orders?: OrderCounts }
  errors?: SheetSyncRun['errors']
  more_errors?: number
}

export interface SheetCheck {
  ok: boolean
  error?: string
  headers?: string[]
  sample?: string[][]
  rows?: number
  suggested?: { key: string | null; fields: Partial<Record<FieldKey, string>>; contacts?: ContactSlot[] }
}

export const SCHEDULES: { value: Schedule; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'every6h', label: '6 h' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const FIELD_GROUPS = ['Customer', 'Contact', 'Address', 'Sales'] as const

/** A blank tab, mapped from a sheet's suggested columns when there are some. */
export function newTab(url = '', suggested?: SheetCheck['suggested'], tab?: string | null): TabConfig {
  const t: TabConfig = { url, key: { column: suggested?.key ?? '', matches: 'sheet_id' }, fields: { ...(suggested?.fields ?? {}) }, balance_rows: 'total' }
  if (tab) t.tab = tab
  if (suggested?.contacts?.length) t.contacts = suggested.contacts.slice(0, MAX_CONTACTS)
  return t
}

/** The next empty contact slot: "Phone 2" for the second. */
export function newContact(n: number): ContactSlot {
  return { phone: '', label: null, fallback: `Phone ${n}` }
}

/** "Every day at 06:00" -- what the schedule means in words. */
export function scheduleText(s: Pick<SheetSyncSettings, 'schedule' | 'at_time' | 'weekday'>): string {
  const at = s.at_time.slice(0, 5)
  switch (s.schedule) {
    case 'hourly':
      return 'Every hour, on the hour'
    case 'every6h':
      return 'Every 6 hours (00:00, 06:00, 12:00, 18:00)'
    case 'daily':
      return `Every day at ${at}`
    case 'weekly':
      return `Every ${WEEKDAYS[(s.weekday - 1 + 7) % 7]} at ${at}`
    default:
      return 'Only when you tap Sync now'
  }
}

/** "Mon 5 Oct, 06:00" in Phnom Penh time. */
export function whenText(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3)
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  return `${day} ${d.getUTCDate()} ${mon}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** "Updated 1,204 · added 12 · skipped 3" (or "would update …" for a preview). */
export function countsText(c: { updated: number; created: number; skipped: number; unchanged?: number; contacts_updated?: number; contacts_created?: number }, preview = false): string {
  const n = (x: number) => x.toLocaleString('en-US')
  const parts = [`${preview ? 'Would update' : 'Updated'} ${n(c.updated)}`, `${preview ? 'add' : 'added'} ${n(c.created)}`]
  if (c.unchanged) parts.push(`${n(c.unchanged)} already up to date`)
  if (c.skipped) parts.push(`${preview ? 'skip' : 'skipped'} ${n(c.skipped)}`)
  if (c.contacts_updated || c.contacts_created)
    parts.push(`contacts: ${preview ? 'would update' : 'updated'} ${n(c.contacts_updated ?? 0)}, ${preview ? 'add' : 'added'} ${n(c.contacts_created ?? 0)}`)
  return parts.join(' · ')
}

/** Whether a tab is ready to save: a sheet link, a key column, and at least one field or contact. */
export function tabProblem(t: TabConfig): string | null {
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(t.url.trim())) return 'Paste a Google Sheets link'
  if (!t.key.column) return 'Pick the column that identifies each customer'
  const contacts = t.contacts ?? []
  if (contacts.some((c) => !c.phone)) return 'Pick the phone column for each contact'
  if (contacts.length && t.key.matches !== 'sheet_id') return 'Contacts need the key column to be the sheet row ID'
  if (!Object.values(t.fields).some(Boolean) && !contacts.length) return 'Pick at least one column to sync'
  return null
}

/** The required sale order columns a tab's header row lacks. */
export function missingOrderColumns(headers: string[]): string[] {
  const have = new Set(headers.map(normHeader))
  return ORDER_COLUMNS.slice(0, 5)
    .map(([, h]) => h)
    .filter((h) => !have.has(normHeader(h)))
}

/** Whether the sale order tab is ready to save. */
export function orderTabProblem(o: OrderTab | null): string | null {
  if (!o) return null
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(o.url.trim())) return 'Paste the sale order sheet’s Google Sheets link'
  return null
}

/** "Orders: 3,120 valid · added 12 · updated 4 · cancelled 1 · skipped 2" (or "would add …" for a preview); null before any order sync. */
export function orderCountsText(c: Partial<OrderCounts> | undefined, preview = false): string | null {
  if (!c || c.read === undefined) return null
  const n = (x = 0) => x.toLocaleString('en-US')
  const parts = [`Orders: ${n(c.valid)} valid of ${n(c.read)}`, `${preview ? 'would add' : 'added'} ${n(c.created)}`, `${preview ? 'update' : 'updated'} ${n(c.updated)}`]
  if (c.cancelled) parts.push(`${preview ? 'cancel' : 'cancelled'} ${n(c.cancelled)}`)
  if (c.unchanged) parts.push(`${n(c.unchanged)} up to date`)
  if (c.skipped) parts.push(`${preview ? 'skip' : 'skipped'} ${n(c.skipped)}`)
  return parts.join(' · ')
}
