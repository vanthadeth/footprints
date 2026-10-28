import { describe, expect, it } from 'vitest'
import { groupOf, groupSources, sourceChip, targetsText } from '../sourceGroups'
import type { Mapping, Source } from '../sources'

const mapping = (over: Partial<Mapping>): Mapping => ({
  id: 'm', name: 'Thing', targetTable: 'items', parentId: null, matchOn: 'sheet_id', requireColumn: null, engine: 'legacy', handler: null, active: true,
  trigger: 'interval', intervalMinutes: 60, lastRunAt: null, columns: [], ...over,
})
const source = (tabName: string, mappings: Partial<Mapping>[]): Source => ({
  id: tabName, name: tabName, spreadsheetId: 's', tabName, headerRow: 1, active: true, mappings: mappings.map((m, i) => mapping({ id: `${tabName}${i}`, ...m })),
})

describe('groupSources', () => {
  const inv = source('INV', [{ name: 'Invoices', targetTable: 'invoices', engine: 'footprints' }])
  const cus = source('CUS', [{ name: 'Customers', targetTable: 'customers' }, { name: 'Customer phone 1', targetTable: 'customer_contacts' }])
  const brand = source('ITEM_BRAND', [{ name: 'Brand', targetTable: 'brands' }])
  const item = source('ITEM_VARIANT', [{ name: 'Item', targetTable: 'items' }])
  const province = source('PROVINCE', [{ name: 'Province', targetTable: 'geo_provinces' }])
  const odd = source('MISC', [{ name: 'Misc', targetTable: 'departments' }])

  it('puts a source with a mapping on the Footprints engine first, and the rest by the tables they feed', () => {
    expect([inv, cus, brand, item, province, odd].map(groupOf)).toEqual(['engine', 'customers', 'products', 'products', 'places', 'other'])
  })
  it('orders groups, sorts A-Z inside, and leaves empty groups out', () => {
    const groups = groupSources([province, item, inv, brand])
    expect(groups.map((g) => [g.title, g.sources.map((s) => s.tabName)])).toEqual([
      ['Invoices & payments', ['INV']],
      ['Products', ['ITEM_BRAND', 'ITEM_VARIANT']],
      ['Places', ['PROVINCE']],
    ])
  })
})

describe('sourceChip', () => {
  it('is the older runner for a source with no mapping on the Footprints engine', () => {
    expect(sourceChip(source('CUS', [{ targetTable: 'customers' }]))).toEqual({ text: 'Older runner', tone: 'neutral' })
  })
  it('says not synced yet until a Footprints-engine mapping has run, then the latest run day', () => {
    expect(sourceChip(source('INV', [{ engine: 'footprints' }]))).toEqual({ text: 'Not synced yet', tone: 'warn' })
    const chip = sourceChip(source('INV', [{ engine: 'footprints', lastRunAt: '2026-10-20T03:00:00Z' }, { engine: 'footprints', lastRunAt: '2026-10-28T03:00:00Z' }]))
    expect(chip).toEqual({ text: 'Synced 28 Oct', tone: 'ok' })
  })
})

describe('targetsText', () => {
  it('lists up to two mappings, else the first and a count', () => {
    expect(targetsText(source('INV', [{ name: 'Invoices' }]))).toBe('Invoices')
    expect(targetsText(source('A', [{ name: 'Customers' }, { name: 'Customer phone 1' }]))).toBe('Customers and Customer phone 1')
    expect(targetsText(source('A', [{ name: 'Customers' }, { name: 'P1' }, { name: 'P2' }, { name: 'P3' }]))).toBe('Customers and 3 more')
  })
})
