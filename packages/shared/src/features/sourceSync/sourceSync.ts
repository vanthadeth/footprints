import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

// The sync_* tables aren't in the generated database types (see sources.ts).
const db = supabase as unknown as SupabaseClient

/** What the source-sync function notices about an invoices tab beyond the counts (only sent for the invoices mapping). */
export interface InvoiceInsights {
  /** Rows per STATUS: 0 draft, 5 submitted, 9 void. */
  status: Record<string, number>
  /** ASSIGN_TO cells that name no active user's sheet ID: the commonest few, and how many invoices in all. */
  unassigned: { id: string; count: number }[]
  unassignedTotal: number
  /** Invoices with no SO_ID: imported without a sale order. */
  noSaleOrder: number
}

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
  insights?: InvoiceInsights
}

export interface SourceSyncResult {
  ok: boolean
  dry?: boolean
  error?: string
  results?: MappingResult[]
  errors?: { tab: number; row: number; reason: string }[]
  more_errors?: number
}

/** One row of sync_runs: a run of one mapping. */
export interface MappingRun {
  id: string
  syncId: string
  trigger: string
  status: 'running' | 'ok' | 'failed'
  startedAt: string
  finishedAt: string | null
  rowsRead: number
  rowsWritten: number
  rowsSkipped: number
  message: string | null
}

/** Calls the source-sync Edge Function; business errors come back as { ok: false, error }. */
export async function invokeSourceSync<T>(body: Record<string, unknown>): Promise<T> {
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

export const sourceSync = {
  /** Preview changes nothing; run writes. syncId limits it to one mapping, otherwise every mapping on the Footprints engine. */
  sync(action: 'preview' | 'run', sourceId: string, syncId?: string): Promise<SourceSyncResult> {
    return invokeSourceSync<SourceSyncResult>({ action, source_id: sourceId, sync_id: syncId })
  },

  /** The latest runs of these mappings, newest first. (Previews record no run.) */
  async runs(syncIds: string[], limit = 20): Promise<MappingRun[]> {
    if (!syncIds.length) return []
    const { data, error } = await db
      .from('sync_runs')
      .select('id, sync_id, source, status, started_at, finished_at, rows_read, rows_written, rows_skipped, message')
      .in('sync_id', syncIds)
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: string; sync_id: string; source: string; status: MappingRun['status']; started_at: string; finished_at: string | null; rows_read: number; rows_written: number; rows_skipped: number; message: string | null }[]).map((r) => ({
      id: r.id,
      syncId: r.sync_id,
      trigger: String(r.source),
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      rowsRead: r.rows_read,
      rowsWritten: r.rows_written,
      rowsSkipped: r.rows_skipped,
      message: r.message,
    }))
  },
}
