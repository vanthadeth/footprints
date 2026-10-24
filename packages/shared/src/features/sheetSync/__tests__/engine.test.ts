import { describe, expect, it } from 'vitest'
import { buildRows, planProblem, type ColumnMap, type MappingPlan } from '../../../../../../supabase/functions/sheet-sync/engine'

const col = (sheetColumn: string, targetColumn: string | null, over: Partial<ColumnMap> = {}): ColumnMap => ({
  sheetColumn, targetColumn, valueKind: 'text', transform: 'none', transformArg: null, referenceTable: null, ...over,
})

const brand: MappingPlan = {
  name: 'Brand', targetTable: 'brands', keyColumn: 'sheet_id', requireColumn: null,
  columns: [col('ID', 'sheet_id'), col('NAME', 'name'), col('LOGO_PATH', null), col('ACTIVE', 'active', { valueKind: 'boolean' })],
}

describe('buildRows', () => {
  const table = [
    ['ID', 'NAME', 'LOGO_PATH', 'ACTIVE'],
    ['b1', 'Acme', 'x.png', 'TRUE'],
    ['b2', ' Bolt ', '', 'false'],
    ['', '', '', ''],
  ]

  it('keys rows by target column, ignores unmapped sheet columns and blank rows', () => {
    const out = buildRows(table, brand, 1, 'dmy')
    expect(out.missing).toEqual([])
    expect(out.rows).toEqual([
      { sheet_id: 'b1', name: 'Acme', active: true },
      { sheet_id: 'b2', name: 'Bolt', active: false },
    ])
  })

  it('matches headers loosely and reports sheet columns that are missing', () => {
    expect(buildRows([['id', 'Name'], ['b1', 'A']], { ...brand, columns: [col('ID', 'sheet_id'), col('NAME', 'name')] }, 1, 'dmy').rows).toHaveLength(1)
    expect(buildRows([['ID']], brand, 1, 'dmy').missing).toEqual(['NAME', 'ACTIVE'])
  })

  it('skips rows without a key, and keeps the last of a repeated key', () => {
    const out = buildRows([['ID', 'NAME', 'LOGO_PATH', 'ACTIVE'], ['', 'No id', '', ''], ['b1', 'First', '', ''], ['b1', 'Second', '', '']], brand, 1, 'dmy')
    expect(out.rows).toEqual([{ sheet_id: 'b1', name: 'Second', active: null }])
    expect(out.skipped).toBe(1)
    expect(out.problems.map((p) => p.reason).join('|')).toMatch(/no ID, row skipped.*repeat/)
  })

  it('drops an unreadable cell, reports it with its sheet row number, and keeps the row', () => {
    const plan: MappingPlan = { ...brand, columns: [col('ID', 'sheet_id'), col('PRICE', 'price_usd', { valueKind: 'number' })] }
    const out = buildRows([['ID', 'PRICE'], ['a', '$1,240.50'], ['b', 'twelve']], plan, 1, 'dmy')
    expect(out.rows).toEqual([{ sheet_id: 'a', price_usd: 1240.5 }, { sheet_id: 'b', price_usd: null }])
    expect(out.problems).toEqual([{ tab: 0, row: 3, reason: expect.stringContaining('PRICE') }])
  })

  it('honours the header row, dates in the chosen order, integers, and a required column', () => {
    const plan: MappingPlan = {
      name: 'Things', targetTable: 't', keyColumn: 'sheet_id', requireColumn: 'PH',
      columns: [col('ID', 'sheet_id'), col('WHEN', 'happened_on', { valueKind: 'date' }), col('QTY', 'qty', { valueKind: 'integer' }), col('PH', 'phone')],
    }
    const out = buildRows([['Title row'], ['ID', 'WHEN', 'QTY', 'PH'], ['a', '03/04/2026', '7', '012'], ['b', '03/04/2026', '7.5', ''], ['c', '', '2', '098']], plan, 2, 'dmy')
    expect(out.rows).toEqual([
      { sheet_id: 'a', happened_on: '2026-04-03', qty: 7, phone: '012' },
      { sheet_id: 'c', happened_on: null, qty: 2, phone: '098' },
    ])
    expect(out.skipped).toBe(1)
    expect(buildRows([['ID', 'WHEN', 'QTY', 'PH'], ['a', '03/04/2026', '7', '012']], plan, 1, 'mdy').rows[0].happened_on).toBe('2026-03-04')
  })

  it('applies fallback, suffix and map-pin transforms', () => {
    const plan: MappingPlan = {
      name: 'Phone 2', targetTable: 'customer_contacts', keyColumn: 'sheet_id', requireColumn: null,
      columns: [
        col('ID', 'sheet_id', { transform: 'suffix', transformArg: '#2' }),
        col('PH2L', 'name', { transform: 'fallback', transformArg: 'Phone 2' }),
        col('PIN', 'latitude', { valueKind: 'number', transform: 'latitude' }),
        col('PIN', 'longitude', { valueKind: 'number', transform: 'longitude' }),
      ],
    }
    expect(buildRows([['ID', 'PH2L', 'PIN'], ['r1', '', '11.5, 104.9'], ['r2', 'Dara', '']], plan, 1, 'dmy').rows).toEqual([
      { sheet_id: 'r1#2', name: 'Phone 2', latitude: 11.5, longitude: 104.9 },
      { sheet_id: 'r2#2', name: 'Dara', latitude: null, longitude: null },
    ])
  })
})

describe('planProblem', () => {
  it('accepts a plain mapping', () => expect(planProblem(brand)).toBeNull())
  it('refuses a mapping with nothing mapped, no key, or a transform it does not have', () => {
    expect(planProblem({ ...brand, columns: [col('LOGO', null)] })).toMatch(/No sheet column/)
    expect(planProblem({ ...brand, columns: [col('NAME', 'name')] })).toMatch(/key column/)
    expect(planProblem({ ...brand, columns: [col('ID', 'sheet_id'), col('NAME', 'name', { transform: 'reference_name_prefix' })] })).toMatch(/reference_name_prefix/)
  })
  it('ignores an unsupported transform on a column that is not mapped', () => {
    expect(planProblem({ ...brand, columns: [col('ID', 'sheet_id'), col('PICTURE', null, { transform: 'drive_image' })] })).toBeNull()
  })
})
