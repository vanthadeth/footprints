import { describe, expect, it } from 'vitest'
import { mapTab, mergeRows, parseCsv, parseDate, parseMoney, resolveProvince, resolveUser, sheetCsvUrl, suggestMapping } from '../../../../supabase/functions/sheet-sync/parse'

describe('sheet csv', () => {
  it('reads quotes, commas and newlines in cells, and a BOM', () => {
    expect(parseCsv('﻿ID,Shop,Note\r\n1,"Lucky, Mart","line 1\nline 2"\n2,"He said ""hi""",\n')).toEqual([
      ['ID', 'Shop', 'Note'],
      ['1', 'Lucky, Mart', 'line 1\nline 2'],
      ['2', 'He said "hi"', ''],
    ])
  })

  it('turns any sheet link into its CSV export for that tab', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/AbC-12_x/edit#gid=345')).toBe('https://docs.google.com/spreadsheets/d/AbC-12_x/export?format=csv&gid=345')
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/AbC/edit?usp=sharing')).toBe('https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=0')
    expect(sheetCsvUrl('https://example.com/sheet')).toBeNull()
  })
})

describe('cells', () => {
  it('reads amounts', () => {
    expect(parseMoney('$1,240.50')).toBe(1240.5)
    expect(parseMoney('1 240')).toBe(1240)
    expect(parseMoney('(120)')).toBe(-120)
    expect(parseMoney('-35.5')).toBe(-35.5)
    expect(parseMoney('USD 5')).toBe(5)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('-')).toBeNull()
    expect(parseMoney('n/a')).toBeNaN()
  })

  it('reads dates in day/month or month/day order, names and serials', () => {
    expect(parseDate('2026-09-28', 'dmy')).toBe('2026-09-28')
    expect(parseDate('28/09/2026', 'dmy')).toBe('2026-09-28')
    expect(parseDate('09/28/2026', 'mdy')).toBe('2026-09-28')
    expect(parseDate('3/4/26', 'dmy')).toBe('2026-04-03')
    expect(parseDate('28-Sep-2026', 'dmy')).toBe('2026-09-28')
    expect(parseDate('Sep 28, 2026', 'dmy')).toBe('2026-09-28')
    expect(parseDate('46293', 'dmy')).toBe('2026-09-28')
    expect(parseDate('31/02/2026', 'dmy')).toBeUndefined()
    expect(parseDate('soon', 'dmy')).toBeUndefined()
    expect(parseDate('', 'dmy')).toBeNull()
  })
})

describe('mapping', () => {
  it('suggests the key and fields from common headers', () => {
    const s = suggestMapping(['Row ID', 'Customer Name', 'Customer code', 'Tel', 'Province', 'Last Purchase', 'Outstanding Balance', 'Sales Rep'])
    expect(s.key).toBe('Row ID')
    expect(s.fields).toMatchObject({
      shop_name: 'Customer Name',
      code: 'Customer code',
      phone: 'Tel',
      province: 'Province',
      last_purchase_date: 'Last Purchase',
      balance: 'Outstanding Balance',
      salesperson: 'Sales Rep',
    })
  })

  it('maps a tab, reporting bad cells and keyless rows, and stops on a missing header', () => {
    const csv = parseCsv('ID,Shop,Balance,Last purchase\nA1,Lucky Mart,"$1,200",28/09/2026\nA2,,oops,someday\n,,,\n,Ghost,5,\n')
    const tab = { url: 'u', key: { column: 'ID', matches: 'sheet_id' as const }, fields: { shop_name: 'Shop', balance: 'Balance', last_purchase_date: 'Last purchase' } }
    const out = mapTab(csv, tab, 1, 'dmy')
    expect(out.rows).toEqual([
      { key: 'A1', matches: 'sheet_id', shop_name: 'Lucky Mart', balance_usd: 1200, last_purchase_date: '2026-09-28' },
      { key: 'A2', matches: 'sheet_id' },
    ])
    expect(out.problems.map((p) => [p.row, p.reason])).toEqual([
      [3, '“oops” in Balance isn’t an amount'],
      [3, '“someday” in Last purchase isn’t a date'],
      [5, 'No ID'],
    ])
    expect(mapTab(csv, { ...tab, fields: { balance: 'Amount due' } }, 1, 'dmy').missing).toEqual(['Amount due'])
  })

  it('merges tabs by key: first text wins, latest purchase, balances summed per tab when asked', () => {
    const merged = mergeRows([
      { rows: [{ key: 'A1', matches: 'sheet_id', shop_name: 'Lucky Mart', phone: '012' }] },
      {
        balanceRows: 'sum',
        rows: [
          { key: 'A1', matches: 'sheet_id', balance_usd: 100, last_purchase_date: '2026-09-01', shop_name: 'Other name' },
          { key: 'A1', matches: 'sheet_id', balance_usd: 50.25, last_purchase_date: '2026-09-28' },
          { key: 'B2', matches: 'sheet_id', balance_usd: 7 },
        ],
      },
    ])
    expect(merged).toEqual([
      { key: 'A1', matches: 'sheet_id', shop_name: 'Lucky Mart', phone: '012', balance_usd: 150.25, last_purchase_date: '2026-09-28' },
      { key: 'B2', matches: 'sheet_id', balance_usd: 7 },
    ])
    expect(mergeRows([{ rows: [{ key: 'C', matches: 'code', balance_usd: 1 }, { key: 'c', matches: 'code', balance_usd: 9 }] }])).toEqual([{ key: 'C', matches: 'code', balance_usd: 9 }])
  })

  it('resolves provinces by code, English or Khmer name, and salespeople by name, nickname or email', () => {
    const provinces = [
      { code: 'KMP', name: 'Kampot', name_alt: 'ខេត្ត កំពត' },
      { code: 'PNH', name: 'Phnom Penh', name_alt: 'ក្រុង ភ្នំពេញ' },
    ]
    expect(resolveProvince('kmp', provinces)).toBe('KMP')
    expect(resolveProvince('Kampot Province', provinces)).toBe('KMP')
    expect(resolveProvince('ខេត្ត កំពត', provinces)).toBe('KMP')
    expect(resolveProvince('phnompenh', provinces)).toBe('PNH')
    expect(resolveProvince('Mars', provinces)).toBeNull()
    const users = [
      { id: 'u1', full_name: 'Men Seyha', nickname: 'Seyha', email: 'seyha@example.com' },
      { id: 'u2', full_name: 'Sok Dara', nickname: null, email: null },
      { id: 'u3', full_name: 'Sok Dara', nickname: null, email: null },
    ]
    expect(resolveUser('seyha', users)).toBe('u1')
    expect(resolveUser('SEYHA@example.com', users)).toBe('u1')
    expect(resolveUser('Sok Dara', users)).toBeNull()
  })
})
