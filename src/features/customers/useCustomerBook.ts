import { useEffect, useRef, useState } from 'react'
import { customerBookService, type ActivityRow, type BookQuery, type BookRow, type BookScope, type Owner, type SummaryRow, type Visitor } from './customerBookService'
import { PAGE_SIZE } from './book'

/** `value`, but only after it has stopped changing for `ms` -- typing doesn't fire a request per key. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

interface Loaded<T> {
  data: T
  /** True until the first response; later reloads keep showing the previous data. */
  loading: boolean
  /** A reload is in flight (previous data still shown). */
  refreshing: boolean
  error: string | null
}

/**
 * Runs `load` whenever `key` changes, keeping the last good data on screen
 * while the next request is in flight and dropping responses that arrive
 * out of order -- no skeleton flash or jumping list while you type.
 */
function useKeyed<T>(key: string, initial: T, load: () => Promise<T>, enabled = true): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: initial, loading: enabled, refreshing: false, error: null })
  const seq = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!enabled) return
    const mine = ++seq.current
    setState((s) => ({ ...s, refreshing: true, error: null }))
    loadRef
      .current()
      .then((data) => {
        if (mine === seq.current) setState({ data, loading: false, refreshing: false, error: null })
      })
      .catch((e) => {
        if (mine === seq.current) setState((s) => ({ ...s, loading: false, refreshing: false, error: e instanceof Error ? e.message : 'Failed to load customers.' }))
      })
  }, [key, enabled])

  return state
}

export function useBookSummary(scope: BookScope, enabled = true): Loaded<SummaryRow[]> {
  return useKeyed(JSON.stringify(scope), [], () => customerBookService.summary(scope), enabled)
}

/** One page of customer_book (the briefing table, Nearby). */
export function useBookPage(query: BookQuery, enabled = true): Loaded<BookRow[]> & { total: number } {
  const res = useKeyed(JSON.stringify(query), [], () => customerBookService.page(query), enabled)
  return { ...res, total: res.data[0]?.total_count ?? 0 }
}

/**
 * A province group in the list: the first `pages` x 20 customers, fetched a
 * page at a time and appended ("Show 20 more"). A new query starts over.
 */
export function useBookGroup(query: BookQuery, pages: number, enabled: boolean): { rows: BookRow[]; total: number; loading: boolean; error: string | null } {
  const key = JSON.stringify(query)
  const [state, setState] = useState<{ key: string; rows: BookRow[]; total: number; loading: boolean; error: string | null }>({ key, rows: [], total: 0, loading: enabled, error: null })
  const seq = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const fresh = state.key !== key
    const have = fresh ? 0 : state.rows.length
    const want = pages * PAGE_SIZE
    if (!fresh && (have >= want || (have > 0 && have >= state.total))) return
    const mine = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    customerBookService
      .page({ ...query, limit: want - have, offset: have })
      .then((rows) => {
        if (mine !== seq.current) return
        setState((s) => ({
          key,
          rows: fresh || s.key !== key ? rows : [...s.rows, ...rows],
          total: rows[0]?.total_count ?? (fresh ? 0 : s.total),
          loading: false,
          error: null,
        }))
      })
      .catch((e) => {
        if (mine === seq.current) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Failed to load customers.' }))
      })
    // state is read only to decide what to fetch next; key/pages/enabled drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pages, enabled])

  // Rows for the previous query stay up until the new ones arrive, so the group doesn't blink empty.
  return { rows: state.rows, total: state.total, loading: state.loading, error: state.error }
}

export function useVisitors(): Visitor[] {
  const { data } = useKeyed('visitors', [] as Visitor[], () => customerBookService.visitors(12))
  return data
}

/** Everyone's visits to one customer (newest first) -- the detail page's metrics and activity. */
export function useCustomerActivity(customerId: string | undefined, refreshKey = 0) {
  return useKeyed(`${customerId}:${refreshKey}`, [] as ActivityRow[], () => customerBookService.activity(customerId!), !!customerId)
}

/** Salespeople who own customers -- the briefing's salesperson picker. */
export function useOwners(): Owner[] {
  const { data } = useKeyed('owners', [] as Owner[], () => customerBookService.owners())
  return data
}
