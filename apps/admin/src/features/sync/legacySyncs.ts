import { supabase } from '@footprints/shared/lib/supabase'

/** One older sync definition: a sheet tab feeding a single table (the sync_definitions framework). */
export interface LegacyDefinition {
  id: string
  name: string
  spreadsheetId: string
  tabName: string
  targetTable: string
  active: boolean
  trigger: string
  intervalMinutes: number | null
  lastRunAt: string | null
}

/** A sheet tab with every table it feeds. */
export interface SheetGroup {
  key: string
  tabName: string
  spreadsheetId: string
  mappings: LegacyDefinition[]
}

export async function listLegacyDefinitions(): Promise<LegacyDefinition[]> {
  const { data, error } = await supabase
    .from('sync_definitions')
    .select('id, name, spreadsheet_id, tab_name, target_table, active, trigger_kind, interval_minutes, last_run_at')
    .order('name')
  if (error) throw new Error(error.details || error.message)
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    spreadsheetId: d.spreadsheet_id,
    tabName: d.tab_name,
    targetTable: d.target_table,
    active: d.active,
    trigger: String(d.trigger_kind),
    intervalMinutes: d.interval_minutes,
    lastRunAt: d.last_run_at,
  }))
}

/** Definitions grouped by the sheet tab they read, so "one sheet, many tables" shows as it is today. */
export function groupBySheet(defs: LegacyDefinition[]): SheetGroup[] {
  const groups = new Map<string, SheetGroup>()
  for (const d of defs) {
    const key = `${d.spreadsheetId}#${d.tabName}`
    const g = groups.get(key) ?? { key, tabName: d.tabName, spreadsheetId: d.spreadsheetId, mappings: [] }
    g.mappings.push(d)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.mappings.length - a.mappings.length || a.tabName.localeCompare(b.tabName))
}
