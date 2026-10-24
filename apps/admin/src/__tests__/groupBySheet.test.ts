import { describe, expect, it } from 'vitest'
import { groupBySheet, type LegacyDefinition } from '../features/sync/legacySyncs'

const def = (name: string, tabName: string, targetTable: string, spreadsheetId = 'sheet1'): LegacyDefinition => ({
  id: name, name, spreadsheetId, tabName, targetTable, active: true, trigger: 'interval', intervalMinutes: 60, lastRunAt: null,
})

describe('groupBySheet', () => {
  it('puts every table fed by one sheet tab in the same group, largest group first', () => {
    const groups = groupBySheet([
      def('Brand', 'ITEM_BRAND', 'brands'),
      def('Customers', 'CUS', 'customers'),
      def('Customer phone 1', 'CUS', 'customer_contacts'),
      def('Customer phone 2', 'CUS', 'customer_contacts'),
    ])
    expect(groups.map((g) => [g.tabName, g.mappings.length])).toEqual([['CUS', 3], ['ITEM_BRAND', 1]])
  })
  it('keeps the same tab name in different spreadsheets apart', () => {
    expect(groupBySheet([def('A', 'CUS', 'customers', 's1'), def('B', 'CUS', 'customers', 's2')])).toHaveLength(2)
  })
})
