import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { nextSort, sortRows, type Sort } from './dataTable'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** The value the column sorts by; without it the column isn't sortable. */
  sortValue?: (row: T) => string | number | null | undefined
  align?: 'left' | 'right'
  className?: string
}

/** A real table for desktop lists: sticky header, sortable columns, clickable rows, empty and loading states. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  initialSort = null,
  loading = false,
  empty = 'Nothing to show.',
}: {
  columns: Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  initialSort?: Sort | null
  loading?: boolean
  empty?: ReactNode
}) {
  const [sort, setSort] = useState<Sort | null>(initialSort)
  const sorted = useMemo(() => sortRows(rows, sort, (row, key) => columns.find((c) => c.key === key)?.sortValue?.(row)), [rows, sort, columns])

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800">
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`sticky top-0 whitespace-nowrap px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-neutral-500 ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => setSort(nextSort(sort, c.key))} className={`inline-flex items-center gap-1 uppercase hover:text-neutral-900 ${active ? 'text-neutral-900' : ''}`}>
                      {c.header}
                      {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <tr key={i} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-100" />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-neutral-500">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800 ${onRowClick ? 'cursor-pointer hover:bg-neutral-50' : ''} ${selectedKey === key ? 'bg-brand-50' : ''}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 align-middle text-neutral-900 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className ?? ''}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
