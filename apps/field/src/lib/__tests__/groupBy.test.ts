import { describe, expect, it } from 'vitest'
import { groupBy, sortGroupKeys } from '../groupBy'

describe('groupBy', () => {
  it('groups items under their key, preserving order within each group', () => {
    const groups = groupBy(
      [
        { id: 1, dept: 'Sales' },
        { id: 2, dept: 'Ops' },
        { id: 3, dept: 'Sales' },
      ],
      (i) => i.dept
    )
    expect([...groups.get('Sales')!.map((i) => i.id)]).toEqual([1, 3])
    expect([...groups.get('Ops')!.map((i) => i.id)]).toEqual([2])
  })
})

describe('sortGroupKeys', () => {
  it('sorts alphabetically with the ungrouped key always last', () => {
    const sorted = sortGroupKeys(['Warehouse', 'No Department', 'Accounting'], 'No Department')
    expect(sorted).toEqual(['Accounting', 'Warehouse', 'No Department'])
  })

  it('keeps the ungrouped key last even when nothing else exists', () => {
    expect(sortGroupKeys(['No Department'], 'No Department')).toEqual(['No Department'])
  })
})
