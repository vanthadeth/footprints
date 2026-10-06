import { supabase } from '@/lib/supabase'
import type { SheetCheck, SheetSyncRun, SheetSyncSettings, SyncResult, TabConfig, Schedule, DateOrder, OrderTab } from './sheetSync'

/** Calls the sheet-sync Edge Function; business errors come back as { ok: false, error }. */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sheet-sync', { body })
  if (error) {
    let message = error.message
    const context = (error as { context?: Response }).context
    if (context) {
      const parsed = await context
        .clone()
        .json()
        .catch(() => null)
      if (parsed && typeof parsed.error === 'string') message = parsed.error
    }
    throw new Error(message)
  }
  return data as T
}

const errText = (e: { message: string; details?: string | null }) => e.details || e.message

export const sheetSyncService = {
  async get(): Promise<SheetSyncSettings> {
    const { data, error } = await supabase
      .from('sheet_sync_settings')
      .select('tabs, orders, date_order, schedule, at_time, weekday, next_run_at, last_synced_at')
      .maybeSingle()
    if (error) throw new Error(errText(error))
    if (!data) throw new Error('Only a Super Admin can open the Google Sheet sync.')
    return data as unknown as SheetSyncSettings
  },

  async save(s: { tabs: TabConfig[]; date_order: DateOrder; schedule: Schedule; at_time: string; weekday: number }): Promise<SheetSyncSettings> {
    const { data, error } = await supabase.rpc('save_sheet_sync', {
      p_tabs: s.tabs as never,
      p_date_order: s.date_order,
      p_schedule: s.schedule,
      p_at_time: s.at_time,
      p_weekday: s.weekday,
    })
    if (error) throw new Error(errText(error))
    return data as unknown as SheetSyncSettings
  },

  /** Save (or, with null, turn off) the sale order tab. */
  async saveOrders(orders: OrderTab | null): Promise<SheetSyncSettings> {
    const { data, error } = await supabase.rpc('save_sheet_sync_orders', { p_orders: orders as never })
    if (error) throw new Error(errText(error))
    return data as unknown as SheetSyncSettings
  },

  async runs(): Promise<SheetSyncRun[]> {
    const { data, error } = await supabase.from('sheet_sync_runs').select('*').order('started_at', { ascending: false }).limit(10)
    if (error) throw new Error(errText(error))
    return (data ?? []) as unknown as SheetSyncRun[]
  },

  /** Read a tab's header row, a sample and the suggested mapping. */
  check(url: string, tab?: string | null): Promise<SheetCheck> {
    return invoke<SheetCheck>({ action: 'headers', url, tab: tab?.trim() || undefined })
  },

  /** What a sync would change, without changing anything. */
  preview(): Promise<SyncResult> {
    return invoke<SyncResult>({ action: 'preview' })
  },

  run(): Promise<SyncResult> {
    return invoke<SyncResult>({ action: 'run' })
  },

  /** When balances were last synced, for "as of" next to a customer's balance. */
  async balanceAsOf(): Promise<string | null> {
    const { data } = await supabase.rpc('sheet_balance_as_of')
    return (data as string | null) ?? null
  },
}
