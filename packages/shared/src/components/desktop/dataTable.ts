export type SortDir = 'asc' | 'desc'

export interface Sort {
  key: string
  dir: SortDir
}

/** Rows sorted by a column's sort value (numbers numerically, text case-insensitively, empty values last); the input order breaks ties. */
export function sortRows<T>(rows: readonly T[], sort: Sort | null, value: (row: T, key: string) => string | number | null | undefined): T[] {
  if (!sort) return [...rows]
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((a, b) => {
      const aEmpty = a.v == null || a.v === ''
      const bEmpty = b.v == null || b.v === ''
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.i - b.i : aEmpty ? 1 : -1
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: 'base', numeric: true })
      return c !== 0 ? sign * c : a.i - b.i
    })
    .map((x) => x.row)
}

/** Click on a header: a new column sorts ascending, the same column flips, a third click clears. */
export function nextSort(current: Sort | null, key: string): Sort | null {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null
}
