import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export interface ColumnMap {
  id: string
  sheetColumn: string
  targetColumn: string
  valueKind: string
  transform: string | null
  transformArg: string | null
  referenceTable: string | null
  sortOrder: number
}

/** One mapping: a sheet tab feeding one table. A child's rows belong to a row of its parent (linked by the sheet row ID). */
export interface Mapping {
  id: string
  name: string
  targetTable: string
  parentId: string | null
  matchOn: 'sheet_id' | 'natural'
  requireColumn: string | null
  engine: 'legacy' | 'footprints'
  handler: 'customers' | 'sale_orders' | null
  active: boolean
  trigger: string
  intervalMinutes: number | null
  lastRunAt: string | null
  columns: ColumnMap[]
}

export interface Source {
  id: string
  name: string
  spreadsheetId: string
  tabName: string
  headerRow: number
  active: boolean
  mappings: Mapping[]
}

// sync_sources arrived after the generated database types, so this query is untyped; the row shapes below follow migration 0119.
const db = supabase as unknown as SupabaseClient

interface RawColumnMap {
  id: string
  sheet_column: string
  target_column: string
  value_kind: string
  transform: string | null
  transform_arg: string | null
  reference_table: string | null
  sort_order: number
}
interface RawDefinition {
  id: string
  name: string
  target_table: string
  parent_id: string | null
  match_on: 'sheet_id' | 'natural'
  require_column: string | null
  engine: 'legacy' | 'footprints'
  handler: 'customers' | 'sale_orders' | null
  active: boolean
  trigger_kind: string
  interval_minutes: number | null
  last_run_at: string | null
  sync_column_maps: RawColumnMap[]
}
interface Raw {
  id: string
  name: string
  spreadsheet_id: string
  tab_name: string
  header_row: number
  active: boolean
  sync_definitions: RawDefinition[]
}

/** Parents first, each followed by its own children; a child whose parent isn't in the list counts as top-level. */
export function orderMappings(mappings: Mapping[]): Mapping[] {
  const ids = new Set(mappings.map((m) => m.id))
  const byName = (a: Mapping, b: Mapping) => a.name.localeCompare(b.name)
  const roots = mappings.filter((m) => !m.parentId || !ids.has(m.parentId)).sort(byName)
  return roots.flatMap((r) => [r, ...mappings.filter((m) => m.parentId === r.id).sort(byName)])
}

/** "Every hour", "Every day", "Every 90 min", or "By hand" -- how often the older runner was set to run a mapping. */
export function cadenceText(m: Pick<Mapping, 'trigger' | 'intervalMinutes'>): string {
  const n = m.intervalMinutes
  if (m.trigger === 'webhook') return 'On webhook'
  if (m.trigger !== 'interval' || !n) return 'By hand'
  if (n === 60) return 'Every hour'
  if (n === 1440) return 'Every day'
  if (n % 1440 === 0) return `Every ${n / 1440} days`
  if (n % 60 === 0) return `Every ${n / 60} hours`
  return `Every ${n} min`
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
}

export async function listSources(): Promise<Source[]> {
  const { data, error } = await db
    .from('sync_sources')
    .select(
      'id, name, spreadsheet_id, tab_name, header_row, active, sync_definitions(id, name, target_table, parent_id, match_on, require_column, engine, handler, active, trigger_kind, interval_minutes, last_run_at, sync_column_maps(id, sheet_column, target_column, value_kind, transform, transform_arg, reference_table, sort_order))',
    )
    .order('name')
  if (error) throw new Error(error.details || error.message)
  const sources = ((data ?? []) as unknown as Raw[]).map((s) => ({
    id: s.id,
    name: s.name,
    spreadsheetId: s.spreadsheet_id,
    tabName: s.tab_name,
    headerRow: s.header_row,
    active: s.active,
    mappings: orderMappings(
      s.sync_definitions.map((d) => ({
        id: d.id,
        name: d.name,
        targetTable: d.target_table,
        parentId: d.parent_id,
        matchOn: d.match_on,
        requireColumn: d.require_column,
        engine: d.engine,
        handler: d.handler,
        active: d.active,
        trigger: String(d.trigger_kind),
        intervalMinutes: d.interval_minutes,
        lastRunAt: d.last_run_at,
        columns: d.sync_column_maps
          .map((c) => ({ id: c.id, sheetColumn: c.sheet_column, targetColumn: c.target_column, valueKind: String(c.value_kind), transform: c.transform ? String(c.transform) : null, transformArg: c.transform_arg, referenceTable: c.reference_table, sortOrder: c.sort_order }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    ),
  }))
  return sources.sort((a, b) => b.mappings.length - a.mappings.length || a.name.localeCompare(b.name))
}
