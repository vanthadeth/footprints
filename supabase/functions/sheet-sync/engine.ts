// Footprints sync engine: pure helpers (no Deno APIs) that turn one sheet tab
// into rows for one mapping (a sync_definitions row + its sync_column_maps),
// so vitest can test them from the app side. The source-sync Edge Function
// (../source-sync/index.ts) fetches the CSV and hands the rows to
// app.sync_engine_apply; everything about reading and converting cells lives
// here.
//
// A mapping's rows are objects keyed by TARGET column, exactly what
// app.sync_apply takes. A column map whose target is empty is a sheet column
// we deliberately ignore. A map with a reference_table carries the parent
// row's sheet ID; the database turns it into that row's id.

import { normHeader, parseBool, parseDate, parseDateTime, parseLatLong, parseMoney, type DateOrder, type RowProblem } from './parse.ts'

export type ValueKind = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'timestamp'
export type Transform = 'none' | 'latitude' | 'longitude' | 'suffix' | 'fallback' | 'drive_image' | 'reference_name_prefix'

export interface ColumnMap {
  sheetColumn: string
  targetColumn: string | null
  valueKind: ValueKind
  transform: Transform
  transformArg: string | null
  referenceTable: string | null
}

export interface MappingPlan {
  name: string
  targetTable: string
  /** The target column rows are matched on: 'sheet_id', or the table's natural key. */
  keyColumn: string
  /** A sheet column that must have a value for the row to be synced. */
  requireColumn: string | null
  columns: ColumnMap[]
}

/** Transforms this engine implements. The others (drive_image, reference_name_prefix) are refused rather than guessed. */
export const SUPPORTED_TRANSFORMS: readonly Transform[] = ['none', 'latitude', 'longitude', 'suffix', 'fallback']

const mapped = (columns: ColumnMap[]) => columns.filter((c) => !!c.targetColumn)

/** Why this mapping can't run on the Footprints engine yet; null when it can. */
export function planProblem(plan: MappingPlan): string | null {
  const cols = mapped(plan.columns)
  if (!cols.length) return 'No sheet column is mapped to a table column.'
  if (!cols.some((c) => c.targetColumn === plan.keyColumn)) return `The key column “${plan.keyColumn}” isn’t mapped, so rows can’t be matched.`
  const bad = [...new Set(cols.filter((c) => !SUPPORTED_TRANSFORMS.includes(c.transform)).map((c) => c.transform))]
  if (bad.length) return `Uses ${bad.length === 1 ? 'a rule' : 'rules'} the Footprints engine doesn’t have yet (${bad.join(', ')}).`
  return null
}

type Converted = { ok: true; value: string | number | boolean | null } | { ok: false; reason: string }

function convert(raw: string, map: ColumnMap, order: DateOrder): Converted {
  const cell = raw.trim()
  const bad = (what: string): Converted => ({ ok: false, reason: `“${map.sheetColumn}” has ${what} “${cell}”` })

  if (map.transform === 'latitude' || map.transform === 'longitude') {
    const p = parseLatLong(cell)
    if (p === undefined) return bad('a map pin that can’t be read:')
    return { ok: true, value: p === null ? null : map.transform === 'latitude' ? p.lat : p.lng }
  }
  let text = cell
  if (map.transform === 'fallback' && !text) text = map.transformArg ?? ''
  if (map.transform === 'suffix' && text) text = text + (map.transformArg ?? '')

  switch (map.valueKind) {
    case 'text':
      return { ok: true, value: text || null }
    case 'number':
    case 'integer': {
      // A percentage cell ("7.00%") is read as its number of percent points (7).
      const n = parseMoney(text.replace(/\s*%$/, ''))
      if (n !== null && (Number.isNaN(n) || (map.valueKind === 'integer' && !Number.isInteger(n)))) return bad(map.valueKind === 'integer' ? 'a number that isn’t whole:' : 'a number that can’t be read:')
      return { ok: true, value: n }
    }
    case 'boolean': {
      const b = parseBool(text)
      return b === undefined ? bad('a yes/no that can’t be read:') : { ok: true, value: b }
    }
    case 'date': {
      const d = parseDate(text, order)
      return d === undefined ? bad('a date that can’t be read:') : { ok: true, value: d }
    }
    case 'timestamp': {
      const t = parseDateTime(text, order)
      return t === undefined ? bad('a date and time that can’t be read:') : { ok: true, value: t }
    }
  }
}

export interface BuiltRows {
  rows: Record<string, string | number | boolean | null>[]
  problems: RowProblem[]
  /** Sheet columns the mapping uses that the header row doesn't have. */
  missing: string[]
  skipped: number
}

const MAX_PROBLEMS = 200

/**
 * Convert one tab's CSV rows (header row at headerRow, 1-based) to rows for
 * the mapping. An unreadable cell is dropped (null) and reported; a row with
 * no key, or empty in the required column, is skipped; a key that repeats
 * keeps its last row. Entirely blank rows are ignored silently.
 */
export function buildRows(table: string[][], plan: MappingPlan, headerRow: number, order: DateOrder): BuiltRows {
  const header = (table[headerRow - 1] ?? []).map((h) => h.trim())
  const col = (name: string) => header.findIndex((h) => h === name.trim() || normHeader(h) === normHeader(name))
  const cols = mapped(plan.columns)
  const at = cols.map((c) => col(c.sheetColumn))
  const requireAt = plan.requireColumn ? col(plan.requireColumn) : -1
  const missing = [...new Set([...cols.filter((_, i) => at[i] < 0).map((c) => c.sheetColumn), ...(plan.requireColumn && requireAt < 0 ? [plan.requireColumn] : [])])]
  const problems: RowProblem[] = []
  if (missing.length) return { rows: [], problems, missing, skipped: 0 }

  const note = (row: number, reason: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push({ tab: 0, row, reason: `${plan.name}: ${reason}` })
  }
  const byKey = new Map<string, Record<string, string | number | boolean | null>>()
  let skipped = 0
  let repeated = 0
  for (let r = headerRow; r < table.length; r++) {
    const cells = table[r]
    if (!cells || cells.every((c) => !c.trim())) continue
    const rowNo = r + 1
    if (requireAt >= 0 && !(cells[requireAt] ?? '').trim()) {
      skipped++
      continue
    }
    const out: Record<string, string | number | boolean | null> = {}
    cols.forEach((c, i) => {
      const res = convert(cells[at[i]] ?? '', c, order)
      if (res.ok) out[c.targetColumn!] = res.value
      else {
        out[c.targetColumn!] = null
        note(rowNo, res.reason)
      }
    })
    const key = out[plan.keyColumn]
    if (key === null || key === undefined || key === '') {
      skipped++
      note(rowNo, `no ${plan.keyColumn === 'sheet_id' ? 'ID' : plan.keyColumn}, row skipped`)
      continue
    }
    const k = String(key)
    if (byKey.has(k)) repeated++
    byKey.set(k, out)
  }
  if (repeated) note(0, `${repeated} ${repeated === 1 ? 'row repeats' : 'rows repeat'} an ID already seen; the last one was used`)
  return { rows: [...byKey.values()], problems, missing, skipped }
}
