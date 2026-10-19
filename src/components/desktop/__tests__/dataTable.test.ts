import { describe, expect, it } from 'vitest'
import { nextSort, sortRows } from '../dataTable'

const rows = [
  { id: 1, name: 'beta', n: 5 },
  { id: 2, name: 'Alpha', n: null },
  { id: 3, name: 'gamma', n: 2 },
  { id: 4, name: 'alpha2', n: 5 },
]
const value = (r: (typeof rows)[number], key: string) => (key === 'n' ? r.n : r.name)

describe('sortRows', () => {
  it('keeps the input order without a sort', () => {
    expect(sortRows(rows, null, value).map((r) => r.id)).toEqual([1, 2, 3, 4])
  })

  it('sorts text ignoring case', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }, value).map((r) => r.id)).toEqual([2, 4, 1, 3])
    expect(sortRows(rows, { key: 'name', dir: 'desc' }, value).map((r) => r.id)).toEqual([3, 1, 4, 2])
  })

  it('sorts numbers numerically with empty values last in both directions, ties in input order', () => {
    expect(sortRows(rows, { key: 'n', dir: 'asc' }, value).map((r) => r.id)).toEqual([3, 1, 4, 2])
    expect(sortRows(rows, { key: 'n', dir: 'desc' }, value).map((r) => r.id)).toEqual([1, 4, 3, 2])
  })
})

describe('nextSort', () => {
  it('goes ascending, descending, then clears; a new column starts ascending', () => {
    const a = nextSort(null, 'name')
    expect(a).toEqual({ key: 'name', dir: 'asc' })
    const b = nextSort(a, 'name')
    expect(b).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort(b, 'name')).toBeNull()
    expect(nextSort(b, 'n')).toEqual({ key: 'n', dir: 'asc' })
  })
})
