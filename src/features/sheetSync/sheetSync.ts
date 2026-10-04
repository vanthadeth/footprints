import { FIELDS, type FieldKey, type TabConfig } from '../../../supabase/functions/sheet-sync/parse'

export { FIELDS, type FieldKey, type TabConfig }

export type Schedule = 'off' | 'hourly' | 'every6h' | 'daily' | 'weekly'
export type DateOrder = 'dmy' | 'mdy'

export interface SheetSyncSettings {
  tabs: TabConfig[]
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
  errors: { tab: number; row: number; reason: string }[]
  message: string | null
}

export interface SyncResult {
  ok: boolean
  run_id?: string
  status?: SheetSyncRun['status']
  error?: string
  counts?: { rows_read: number; updated: number; created: number; unchanged: number; skipped: number }
  errors?: SheetSyncRun['errors']
  more_errors?: number
}

export interface SheetCheck {
  ok: boolean
  error?: string
  headers?: string[]
  sample?: string[][]
  rows?: number
  suggested?: { key: string | null; fields: Partial<Record<FieldKey, string>> }
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
export function newTab(url = '', suggested?: SheetCheck['suggested']): TabConfig {
  return { url, key: { column: suggested?.key ?? '', matches: 'sheet_id' }, fields: { ...(suggested?.fields ?? {}) }, balance_rows: 'total' }
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
export function countsText(c: { updated: number; created: number; skipped: number; unchanged?: number }, preview = false): string {
  const n = (x: number) => x.toLocaleString('en-US')
  const parts = [`${preview ? 'Would update' : 'Updated'} ${n(c.updated)}`, `${preview ? 'add' : 'added'} ${n(c.created)}`]
  if (c.unchanged) parts.push(`${n(c.unchanged)} already up to date`)
  if (c.skipped) parts.push(`${preview ? 'skip' : 'skipped'} ${n(c.skipped)}`)
  return parts.join(' · ')
}

/** Whether a tab is ready to save: a sheet link, a key column, and at least one field. */
export function tabProblem(t: TabConfig): string | null {
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(t.url.trim())) return 'Paste a Google Sheets link'
  if (!t.key.column) return 'Pick the column that identifies each customer'
  if (!Object.values(t.fields).some(Boolean)) return 'Pick at least one column to sync'
  return null
}
