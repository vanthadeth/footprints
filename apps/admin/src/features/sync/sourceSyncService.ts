import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@footprints/shared/lib/supabase'
import { toRow, type DraftColumn } from './columnMapDiff'
import { diffColumns } from './columnMapDiff'
import type { ColumnMap } from './sources'

// The sync_* tables aren't in the generated database types (see sources.ts).
const db = supabase as unknown as SupabaseClient

export interface MappingResult {
  sync_id: string
  name: string
  table: string
  read: number
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  error?: string
}

export interface SourceSyncResult {
  ok: boolean
  dry?: boolean
  error?: string
  results?: MappingResult[]
  errors?: { tab: number; row: number; reason: string }[]
  more_errors?: number
}

/** Calls the source-sync Edge Function; business errors come back as { ok: false, error }. */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('source-sync', { body })
  if (error) {
    let message = error.message
    const context = (error as { context?: Response }).context
    if (context) {
      const parsed = await context.clone().json().catch(() => null)
      if (parsed && typeof parsed.error === 'string') message = parsed.error
    }
    throw new Error(message)
  }
  return data as T
}

export const sourceSyncService = {
  /** Preview changes nothing; run writes. syncId limits it to one mapping, otherwise every mapping on the Footprints engine. */
  sync(action: 'preview' | 'run', sourceId: string, syncId?: string): Promise<SourceSyncResult> {
    return invoke<SourceSyncResult>({ action, source_id: sourceId, sync_id: syncId })
  },

  switchEngine(syncId: string, engine: 'footprints' | 'legacy'): Promise<{ ok: boolean; error?: string }> {
    return invoke({ action: 'switch', sync_id: syncId, engine })
  },

  /** The columns a sync may write on a table (the sync_targets safety list), with their types. */
  async allowedColumns(table: string): Promise<{ name: string; type: string }[]> {
    const { data, error } = await db.rpc('sync_columns', { p_table: table })
    if (error) throw new Error(error.message)
    return ((data ?? []) as { column_name: string; data_type: string }[]).map((c) => ({ name: c.column_name, type: c.data_type }))
  },

  /** Tables a column can look a parent up in, and the key column of each table. */
  async targets(): Promise<{ table: string; label: string; keyColumn: string }[]> {
    const { data, error } = await db.from('sync_targets').select('table_name, label, key_column').order('sort_order')
    if (error) throw new Error(error.message)
    return ((data ?? []) as { table_name: string; label: string; key_column: string }[]).map((t) => ({ table: t.table_name, label: t.label, keyColumn: t.key_column }))
  },

  /** Saves the editor: removed rows, then changed ones, then new ones. The database refuses a target column a sync may not write. */
  async saveColumns(syncId: string, original: ColumnMap[], draft: DraftColumn[]): Promise<void> {
    const { deletes, updates, inserts } = diffColumns(original, draft)
    if (deletes.length) {
      const { error } = await db.from('sync_column_maps').delete().in('id', deletes)
      if (error) throw new Error(error.message)
    }
    for (const u of updates) {
      const { error } = await db.from('sync_column_maps').update(toRow(u.draft, syncId, u.sortOrder)).eq('id', u.draft.id!)
      if (error) throw new Error(error.message)
    }
    if (inserts.length) {
      const { error } = await db.from('sync_column_maps').insert(inserts.map((i) => toRow(i.draft, syncId, i.sortOrder)))
      if (error) throw new Error(error.message)
    }
  },
}
