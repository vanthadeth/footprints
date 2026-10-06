import { describe, expect, it } from 'vitest'
import { gidForTab, mapTab, mergeRows, parseCsv, parseDate, parseLatLong, parseMoney, resolveProvince, resolveUser, sheetCsvUrl, suggestMapping } from '../../../../supabase/functions/sheet-sync/parse'

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

// The CUS tab the previous app synced customers and contacts from.
const CUS_HEADER =
  'ID,QBID,NAME,BIZ_TYPE,PH1,PH1L,PH2,PH2L,PH3,PH3L,STREET,COMMUNE,DISTRICT,PROVINCE_ID,LANDMARK,LAT/LONG,REMARKS,ASSIGN_TO,ACTIVE,CR,CRTS,MD,MDTS,PREFER_TRUCK_LIST,PIC_ID,CREDIT_LIMIT,EXT_AR_DAY,LAST_VISIT_DATE,LAST_PURCHASE_DATE,BIZ_TYPE_2,ZIPCODE,ZONE,CLASS'

describe('previous app setup (CUS tab)', () => {
  it('finds a tab by name in the htmlview page', () => {
    const html =
      '<ul id="sheet-menu"><li id="sheet-button-0"><a href="#">Read me</a></li><li id="sheet-button-1764533012"><a href="#">CUS</a></li></ul>' +
      '<script>items.push({name: "Read me", pageUrl: "x", gid: "0",initialSheet: true});items.push({name: "Rock \\u0026 Roll", pageUrl: "y", gid: "77"});</script>'
    expect(gidForTab(html, 'cus')).toBe('1764533012')
    expect(gidForTab(html, ' Read  me ')).toBe('0')
    expect(gidForTab(html, 'Rock & Roll')).toBe('77')
    expect(gidForTab(html, 'Balances')).toBeNull()
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/AbC/edit', '1764533012')).toBe('https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=1764533012')
  })

  it('reads a map pin', () => {
    expect(parseLatLong('11.047996, 103.803276')).toEqual({ lat: 11.047996, lng: 103.803276 })
    expect(parseLatLong('(13.26,104.12)')).toEqual({ lat: 13.26, lng: 104.12 })
    expect(parseLatLong('')).toBeNull()
    expect(parseLatLong('near the market')).toBeUndefined()
    expect(parseLatLong('200, 10')).toBeUndefined()
    expect(parseLatLong('0, 0')).toBeNull()
    expect(parseLatLong('0.000000, 0.000000')).toBeNull()
  })

  it('suggests the old mapping, with three phone contacts', () => {
    const s = suggestMapping(CUS_HEADER.split(','))
    expect(s.key).toBe('ID')
    expect(s.contacts).toEqual([
      { phone: 'PH1', label: 'PH1L', fallback: 'Phone 1' },
      { phone: 'PH2', label: 'PH2L', fallback: 'Phone 2' },
      { phone: 'PH3', label: 'PH3L', fallback: 'Phone 3' },
    ])
    expect(s.fields).toMatchObject({
      shop_name: 'NAME', business_type: 'BIZ_TYPE', street_address: 'STREET', commune: 'COMMUNE', district: 'DISTRICT',
      province: 'PROVINCE_ID', landmark: 'LANDMARK', lat_long: 'LAT/LONG', remarks: 'REMARKS', zipcode: 'ZIPCODE',
      last_purchase_date: 'LAST_PURCHASE_DATE', credit_limit: 'CREDIT_LIMIT',
    })
    expect(s.fields.phone).toBeUndefined()
  })

  it('maps contacts by slot, with the fallback name, skipping empty phones', () => {
    const csv = `${CUS_HEADER}\n352A33FE,KKG/Chan,Chan Savan,Hardware,016 738 832,,088 905 9000,Dara,,,NR4,Chamkar,Kampong Seila,KKG,By the fork,"11.047996, 103.803276",Call first`
    const tab = {
      url: 'x',
      tab: 'CUS',
      key: { column: 'ID', matches: 'sheet_id' as const },
      fields: { shop_name: 'NAME', lat_long: 'LAT/LONG', remarks: 'REMARKS', zipcode: 'ZIPCODE' },
      contacts: [
        { phone: 'PH1', label: 'PH1L', fallback: 'Phone 1' },
        { phone: 'PH2', label: 'PH2L', fallback: 'Phone 2' },
        { phone: 'PH3', label: 'PH3L', fallback: 'Phone 3' },
      ],
    }
    const out = mapTab(parseCsv(csv), tab, 1, 'dmy')
    expect(out.missing).toEqual([])
    expect(out.problems).toEqual([])
    expect(out.rows[0]).toEqual({
      key: '352A33FE', matches: 'sheet_id', shop_name: 'Chan Savan', remarks: 'Call first', latitude: 11.047996, longitude: 103.803276,
      contacts: [
        { slot: 1, name: 'Phone 1', phone: '016 738 832' },
        { slot: 2, name: 'Dara', phone: '088 905 9000' },
      ],
    })
    expect(mapTab(parseCsv('ID,NAME\n1,A'), tab, 1, 'dmy').missing).toEqual(['LAT/LONG', 'REMARKS', 'ZIPCODE', 'PH1', 'PH1L', 'PH2', 'PH2L', 'PH3', 'PH3L'])
    const merged = mergeRows([
      { rows: [{ key: 'A', matches: 'sheet_id', contacts: [{ slot: 1, name: 'Phone 1', phone: '1' }] }] },
      { rows: [{ key: 'A', matches: 'sheet_id', latitude: 11, longitude: 104, contacts: [{ slot: 1, name: 'X', phone: '9' }, { slot: 2, name: 'Phone 2', phone: '2' }] }] },
    ])
    expect(merged[0]).toEqual({ key: 'A', matches: 'sheet_id', latitude: 11, longitude: 104, contacts: [{ slot: 1, name: 'Phone 1', phone: '1' }, { slot: 2, name: 'Phone 2', phone: '2' }] })
  })
})
