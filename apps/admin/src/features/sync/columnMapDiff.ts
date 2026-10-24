import type { ColumnMap } from './sources'

/** One row of the mapping editor: a saved column map (id set) or a new one (id null). */
export interface DraftColumn {
  /** Stable key for the editor's list; not saved. */
  key: string
  id: string | null
  sheetColumn: string
  targetColumn: string | null
  valueKind: string
  transform: string
  transformArg: string | null
  referenceTable: string | null
}

export const toDraft = (c: ColumnMap): DraftColumn => ({
  key: c.id, id: c.id, sheetColumn: c.sheetColumn, targetColumn: c.targetColumn || null, valueKind: c.valueKind,
  transform: c.transform ?? 'none', transformArg: c.transformArg, referenceTable: c.referenceTable,
})

const same = (a: DraftColumn, b: ColumnMap) =>
  a.sheetColumn === b.sheetColumn && (a.targetColumn ?? null) === (b.targetColumn || null) && a.valueKind === b.valueKind &&
  a.transform === (b.transform ?? 'none') && (a.transformArg || null) === (b.transformArg || null) && (a.referenceTable || null) === (b.referenceTable || null)

/** A column map as the table stores it, with its position in the editor as sort_order. */
export const toRow = (d: DraftColumn, syncId: string, sortOrder: number) => ({
  sync_id: syncId,
  sheet_column: d.sheetColumn.trim(),
  target_column: d.targetColumn || null,
  value_kind: d.valueKind,
  transform: d.transform,
  transform_arg: d.transform === 'fallback' || d.transform === 'suffix' ? (d.transformArg ?? '') : null,
  reference_table: d.referenceTable || null,
  sort_order: sortOrder,
})

/** What saving the editor changes: ids to delete, saved rows to update (with their new position), and new rows to insert. */
export function diffColumns(original: ColumnMap[], draft: DraftColumn[]) {
  const byId = new Map(original.map((c) => [c.id, c]))
  const kept = new Set(draft.filter((d) => d.id).map((d) => d.id))
  return {
    deletes: original.filter((c) => !kept.has(c.id)).map((c) => c.id),
    updates: draft.flatMap((d, i) => {
      const o = d.id ? byId.get(d.id) : undefined
      return o && (!same(d, o) || o.sortOrder !== i) ? [{ draft: d, sortOrder: i }] : []
    }),
    inserts: draft.flatMap((d, i) => (d.id ? [] : [{ draft: d, sortOrder: i }])),
  }
}

/** The first thing wrong with the draft, or null: a sheet column is needed on every row, and two rows can't fill the same table column. */
export function draftProblem(draft: DraftColumn[]): string | null {
  if (draft.some((d) => !d.sheetColumn.trim())) return 'Every row needs the sheet column’s name.'
  const targets = draft.map((d) => d.targetColumn).filter((t): t is string => !!t)
  const dup = targets.find((t, i) => targets.indexOf(t) !== i)
  if (dup) return `More than one sheet column fills “${dup}”.`
  if (draft.some((d) => (d.transform === 'suffix' || d.transform === 'fallback') && !(d.transformArg ?? '').length)) return 'Add the text for the rows that use “add to end” or “if empty”.'
  return null
}
