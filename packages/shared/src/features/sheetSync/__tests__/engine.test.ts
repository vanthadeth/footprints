import { describe, expect, it } from 'vitest'
import { buildRows, invoiceInsights, planProblem, type ColumnMap, type MappingPlan } from '../../../../../../supabase/functions/sheet-sync/engine'

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

describe('invoice and payment term tabs', () => {
  const terms: MappingPlan = {
    name: 'Payment terms', targetTable: 'payment_terms', keyColumn: 'sheet_id', requireColumn: null,
    columns: [
      col('ID', 'sheet_id'), col('PERIOD_1', 'period_1', { valueKind: 'integer' }), col('TERM_1', 'term_1', { valueKind: 'number' }),
      col('PERIOD_2', 'period_2', { valueKind: 'integer' }), col('TERM_2', 'term_2', { valueKind: 'number' }),
      col('IS_DEFAULT', 'is_default', { valueKind: 'boolean' }), col('ACTIVE', 'active', { valueKind: 'boolean' }),
    ],
  }

  it('reads percentages as percent points', () => {
    const out = buildRows([
      ['ID', 'PERIOD_1', 'TERM_1', 'PERIOD_2', 'TERM_2', 'IS_DEFAULT', 'ACTIVE'],
      ['2bb2020f', '0', '0.00%', '', '', 'TRUE', 'TRUE'],
      ['636c5bae', '0', '7.00%', '30', '2.00%', 'FALSE', 'TRUE'],
    ], terms, 1, 'dmy')
    expect(out.problems).toEqual([])
    expect(out.rows).toEqual([
      { sheet_id: '2bb2020f', period_1: 0, term_1: 0, period_2: null, term_2: null, is_default: true, active: true },
      { sheet_id: '636c5bae', period_1: 0, term_1: 7, period_2: 30, term_2: 2, is_default: false, active: true },
    ])
  })

  const invoices: MappingPlan = {
    name: 'Invoices', targetTable: 'invoices', keyColumn: 'sheet_id', requireColumn: null,
    columns: [
      col('ID', 'sheet_id'), col('CRTS', 'sheet_created_at', { valueKind: 'timestamp' }), col('ASSIGN_TO', 'assign_to'),
      col('SO_ID', 'so_sheet_id'), col('INV_NO', 'inv_no'), col('INV_DATE', 'inv_date', { valueKind: 'date' }),
      col('DL_REQ', 'dl_req', { valueKind: 'boolean' }), col('DL_STATUS', 'dl_status', { valueKind: 'integer' }),
      col('STATUS', 'status', { valueKind: 'integer' }), col('PAYMENT_TERM', 'payment_term'), col('DUE_DATE', null),
      col('PDF_PATH', null), col('INV_VALUE', 'inv_value', { valueKind: 'number' }),
    ],
  }
  const header = ['ID', 'CRTS', 'ASSIGN_TO', 'SO_ID', 'INV_NO', 'INV_DATE', 'DL_REQ', 'DL_STATUS', 'STATUS', 'PAYMENT_TERM', 'DUE_DATE', 'PDF_PATH', 'INV_VALUE']

  it('reads the invoice sheet month first: a date like 9/1/2021 is 1 September, not 9 January', () => {
    const table = [
      header,
      ['1211dfb5', '8/27/2021 21:52:00', 'pheakdey', '9C8AC9AA-413C-4ADE', '2021-0181', '8/18/2021', 'FALSE', '', '5', '2bb2020f', '17/09/2021', 'PDF/1.pdf', '337.92'],
      ['184cf038', '8/28/2021 14:25:00', 'pheakdey', '', '2021-0187', '9/1/2021', 'TRUE', '9', '9', '2bb2020f', '01/10/2021', '', '63.62'],
    ]
    const out = buildRows(table, invoices, 1, 'mdy')
    expect(out.problems).toEqual([])
    expect(out.rows.map((r) => [r.sheet_id, r.inv_date, r.status, r.dl_status, r.so_sheet_id, r.inv_value])).toEqual([
      ['1211dfb5', '2021-08-18', 5, null, '9C8AC9AA-413C-4ADE', 337.92],
      ['184cf038', '2021-09-01', 9, 9, null, 63.62],
    ])
    expect(out.rows[0]).not.toHaveProperty('due_date')
    expect(out.rows[0]).not.toHaveProperty('pdf_path')
    // Read day first, the same cell would be wrong, and 8/18/2021 would not read at all.
    expect(buildRows(table, invoices, 1, 'dmy').rows[1].inv_date).toBe('2021-01-09')
    expect(buildRows(table, invoices, 1, 'dmy').problems.length).toBeGreaterThan(0)
  })
})

describe('invoiceInsights', () => {
  const rows = [
    { status: 5, assign_to: 'pheakdey', so_sheet_id: 'so1' },
    { status: 5, assign_to: 'other , Seyha', so_sheet_id: null },
    { status: 9, assign_to: '9af927a9', so_sheet_id: 'so2' },
    { status: 5, assign_to: '9af927a9', so_sheet_id: null },
    { status: 0, assign_to: '', so_sheet_id: null },
    { status: null, assign_to: 'cbe84092', so_sheet_id: 'so3' },
  ]
  const out = invoiceInsights(rows, new Set(['pheakdey', 'seyha']))

  it('counts statuses, with anything else as other', () => expect(out.status).toEqual({ '5': 3, '9': 1, '0': 1, other: 1 }))
  it('finds invoices whose ASSIGN_TO names no active sheet ID, commonest first, the first matching ID in a cell is enough', () => {
    expect(out.unassignedTotal).toBe(4)
    expect(out.unassigned).toEqual([{ id: '9af927a9', count: 2 }, { id: '(blank)', count: 1 }, { id: 'cbe84092', count: 1 }])
  })
  it('counts invoices without a sale order', () => expect(out.noSaleOrder).toBe(3))
})
