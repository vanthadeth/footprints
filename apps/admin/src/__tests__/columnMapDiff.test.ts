import { describe, expect, it } from 'vitest'
import { diffColumns, draftProblem, toDraft, type DraftColumn } from '../features/sync/columnMapDiff'
import type { ColumnMap } from '../features/sync/sources'

const col = (id: string, sheetColumn: string, targetColumn: string | null, over: Partial<ColumnMap> = {}): ColumnMap => ({
  id, sheetColumn, targetColumn: targetColumn ?? '', valueKind: 'text', transform: 'none', transformArg: null, referenceTable: null, sortOrder: 0, ...over,
})
const fresh = (sheetColumn: string, targetColumn: string | null): DraftColumn => ({ key: sheetColumn, id: null, sheetColumn, targetColumn, valueKind: 'text', transform: 'none', transformArg: null, referenceTable: null })

describe('diffColumns', () => {
  const original = [col('1', 'ID', 'sheet_id'), col('2', 'NAME', 'name'), col('3', 'LOGO', null)]

  it('finds nothing to do when the editor is untouched (positions match the saved order)', () => {
    const o = original.map((c, i) => ({ ...c, sortOrder: i }))
    expect(diffColumns(o, o.map(toDraft))).toEqual({ deletes: [], updates: [], inserts: [] })
  })

  it('separates removed, changed, moved and new rows', () => {
    const o = original.map((c, i) => ({ ...c, sortOrder: i }))
    const draft = [toDraft(o[1]), { ...toDraft(o[0]), targetColumn: 'code' }, fresh('DESC', 'description')]
    const d = diffColumns(o, draft)
    expect(d.deletes).toEqual(['3'])
    expect(d.updates.map((u) => [u.draft.id, u.sortOrder])).toEqual([['2', 0], ['1', 1]])
    expect(d.inserts.map((i) => [i.draft.sheetColumn, i.sortOrder])).toEqual([['DESC', 2]])
  })

  it('treats an empty target and a null target as the same ignored column', () => {
    const o = [{ ...col('3', 'LOGO', null), sortOrder: 0 }]
    expect(diffColumns(o, o.map(toDraft)).updates).toEqual([])
  })
})

describe('draftProblem', () => {
  it('accepts a good draft', () => expect(draftProblem([fresh('ID', 'sheet_id'), fresh('NAME', 'name'), fresh('LOGO', null), fresh('PIC', null)])).toBeNull())
  it('needs a sheet column on every row', () => expect(draftProblem([fresh(' ', 'name')])).toMatch(/sheet column/))
  it('refuses two sheet columns filling the same table column, but allows several ignored ones', () => {
    expect(draftProblem([fresh('A', 'name'), fresh('B', 'name')])).toMatch(/“name”/)
  })
  it('needs the text for suffix and fallback rules', () => {
    expect(draftProblem([{ ...fresh('A', 'name'), transform: 'suffix', transformArg: '' }])).toMatch(/text/)
    expect(draftProblem([{ ...fresh('A', 'name'), transform: 'suffix', transformArg: '#1' }])).toBeNull()
  })
})
