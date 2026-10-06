import { describe, expect, it } from 'vitest'
import { isValidOrder, mapOrders, parseBool, parseCsv, parseDateTime, resolveAssignee } from '../../../../supabase/functions/sheet-sync/parse'
import { missingOrderColumns, orderCountsText, orderTabProblem } from '../sheetSync'

const HEADER =
  'ID,ORDER_NUMBER,ASSIGN_TO,CUSTOMER_ID,ORDER_DATE,DL_DATE,IS_KHR,REMARKS,DL_REQ,TRUCK_ID,NUMBER_OF_CTN,ORDER_STATUS,APPROVED,STOCK_CHECKED,APPROVED_BY,APPROVED_TS,CR,CRTS,MD,MDTS,PAYMENT_TERM,SO_TYPE,LAT/LONG,DISTANCE,SO_VALUE'

const csv = (...rows: string[]) => parseCsv([HEADER, ...rows].join('\n'))

describe('sale order parsing', () => {
  it('reads booleans the way Google exports them', () => {
    expect(parseBool('TRUE')).toBe(true)
    expect(parseBool('false')).toBe(false)
    expect(parseBool('1')).toBe(true)
    expect(parseBool('')).toBeNull()
    expect(parseBool('maybe')).toBeUndefined()
  })

  it('reads day-first timestamps as Phnom Penh time', () => {
    expect(parseDateTime('26/08/2021 23:55:53', 'dmy')).toBe('2021-08-26T23:55:53+07:00')
    expect(parseDateTime('2/1/2026 3:02 PM', 'dmy')).toBe('2026-01-02T15:02:00+07:00')
    expect(parseDateTime('24/08/2021', 'dmy')).toBe('2021-08-24T00:00:00+07:00')
    expect(parseDateTime('', 'dmy')).toBeNull()
    expect(parseDateTime('31/02/2021 10:00', 'dmy')).toBeUndefined()
  })

  it('maps a row, with remarks spanning lines, and tells valid orders apart', () => {
    const { rows, problems, missing } = mapOrders(
      csv(
        '992F,AG2215-327,"pheakdey , seyha",DC7A,24/08/2021,25/08/2021,FALSE,"Line 1\nLine 2",,T1,3,1,TRUE,TRUE,seyha,26/08/2021 23:55:53,vantha,26/08/2021 23:50:00,2bb2020f,02/01/2026 03:02:48,COD,Normal,"11.5, 104.9",1.25,"1,385.32"',
        'CFBC,AF3019-308,seyha,85CF,24/08/2021,,TRUE,,,,,1,FALSE,FALSE,,,,,,,,,,,63.62',
        'AAAA,AF1,seyha,85CF,24/08/2021,,,,,,,0,TRUE,,,,,,,,,,,,10',
      ),
      'dmy',
    )
    expect(missing).toEqual([])
    expect(problems).toEqual([])
    expect(rows).toHaveLength(3)
    const [a, b, c] = rows
    expect(a).toMatchObject({
      sheet_id: '992F',
      order_no: 'AG2215-327',
      assign_to: 'pheakdey , seyha',
      customer_sheet_id: 'DC7A',
      order_date: '2021-08-24',
      delivery_date: '2021-08-25',
      is_khr: false,
      note: 'Line 1\nLine 2',
      truck_id: 'T1',
      cartons: 3,
      order_status: 1,
      approved: true,
      stock_checked: true,
      approved_at: '2021-08-26T23:55:53+07:00',
      created_by: 'vantha',
      modified_at: '2026-01-02T03:02:48+07:00',
      payment_term: 'COD',
      latitude: 11.5,
      longitude: 104.9,
      distance: 1.25,
      value: 1385.32,
    })
    expect(isValidOrder(a)).toBe(true)
    expect(b.is_khr).toBe(true)
    expect(isValidOrder(b)).toBe(false)
    expect(isValidOrder(c)).toBe(false)
  })

  it('stops on missing required columns, but not on missing optional ones', () => {
    expect(mapOrders(parseCsv('ID,ORDER_NUMBER,CUSTOMER_ID\nx,1,c'), 'dmy').missing).toEqual(['ORDER_STATUS', 'APPROVED'])
    const { rows, missing } = mapOrders(parseCsv('id,Order Number,Customer_ID,Order Status,Approved\nx,1,c,1,TRUE'), 'dmy')
    expect(missing).toEqual([])
    expect(rows[0]).toMatchObject({ sheet_id: 'x', order_no: '1', customer_sheet_id: 'c', order_status: 1, approved: true, value: null })
  })

  it('reports bad cells only on valid orders, and keeps the last row for a repeated ID', () => {
    const { rows, problems } = mapOrders(
      csv(
        'X1,N1,a,C1,soon,,,,,,,1,TRUE,,,,,,,,,,,,10',
        'X2,N2,a,C1,soon,,,,,,,2,TRUE,,,,,,,,,,,,10',
        'X1,N1,a,C1,01/09/2021,,,,,,,1,TRUE,,,,,,,,,,,,12',
        ',,,,,,,,,,,,,,,,,,,,,,,,',
      ),
      'dmy',
    )
    expect(problems).toEqual([{ tab: 0, row: 2, reason: '“soon” in ORDER_DATE isn’t a date' }])
    expect(rows.map((r) => [r.sheet_id, r.order_date, r.value])).toEqual([
      ['X1', '2021-09-01', 12],
      ['X2', null, 10],
    ])
  })

  it('picks the first ASSIGN_TO name that is one active user', () => {
    const users = [
      { id: 'u1', full_name: 'MEN SEYHA', nickname: 'Seyha', email: null },
      { id: 'u2', full_name: 'ប៊ូ បុទុមភក្តី', nickname: 'Pheakdey', email: null },
    ]
    expect(resolveAssignee('pheakdey , seyha', users)).toBe('u2')
    expect(resolveAssignee('nobody, seyha', users)).toBe('u1')
    expect(resolveAssignee('nobody', users)).toBeNull()
    expect(resolveAssignee(null, users)).toBeNull()
  })
})

describe('sale order page helpers', () => {
  it('lists the required columns a tab lacks', () => {
    expect(missingOrderColumns(HEADER.split(','))).toEqual([])
    expect(missingOrderColumns(['ID', 'order number', 'CUSTOMER_ID'])).toEqual(['ORDER_STATUS', 'APPROVED'])
  })

  it('needs a Google Sheets link when on', () => {
    expect(orderTabProblem(null)).toBeNull()
    expect(orderTabProblem({ url: 'https://example.com', tab: 'SO' })).toMatch(/link/)
    expect(orderTabProblem({ url: 'https://docs.google.com/spreadsheets/d/abc/edit', tab: 'SO' })).toBeNull()
  })

  it('says what the order sync did', () => {
    expect(orderCountsText({})).toBeNull()
    expect(orderCountsText({ read: 5200, valid: 3100, created: 12, updated: 4, unchanged: 3080, cancelled: 1, skipped: 3 })).toBe(
      'Orders: 3,100 valid of 5,200 · added 12 · updated 4 · cancelled 1 · 3,080 up to date · skipped 3',
    )
    expect(orderCountsText({ read: 10, valid: 2, created: 2, updated: 0, unchanged: 0, cancelled: 0, skipped: 0 }, true)).toBe('Orders: 2 valid of 10 · would add 2 · update 0')
  })
})
