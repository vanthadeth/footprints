import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { displayName } from '@/lib/displayName'
import type { BookRow, BookSort, Bucket } from '@/features/customers/customerBookService'
import { useBookPage, useBookSummary, useDebounced, useOwners, useVisitors } from '@/features/customers/useCustomerBook'
import { CustomerFilterSheet, FilterButton, FilterChips, PeoplePicker } from '@/features/customers/CustomerFilterSheet'
import {
  EMPTY_FILTER,
  PAGE_SIZE,
  RANGES,
  URGENCY,
  activeCount,
  freqText,
  lastVisitText,
  outcomeText,
  pageButtons,
  pager,
  peopleActive,
  peopleLabel,
  shortDay,
  summarize,
  toggle,
  urgency,
  visitorNames,
  visitsText,
  type CustomerFilter,
} from '@/features/customers/book'
import { PHNOM_PENH } from '@/features/customers/provinces'
import { useIsDesktop } from '@/hooks/useIsDesktop'

/** Column key -> customer_book sort; null = not sortable. */
const COLS: { sort: BookSort | null; label: string; right?: boolean }[] = [
  { sort: 'name', label: 'Customer' },
  { sort: 'owner', label: 'Salesperson' },
  { sort: 'last', label: 'Last visit' },
  { sort: 'visits', label: '90 days', right: true },
  { sort: 'freq', label: 'Frequency' },
  { sort: null, label: 'Last outcome' },
  { sort: 'next', label: 'Next visit' },
]
const GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.35fr)_56px_minmax(0,0.75fr)_minmax(0,1.1fr)_minmax(0,0.8fr)] gap-2.5'

/** Descending unless it's a sort that reads naturally A→Z / soonest first. */
const DEFAULT_DESC: Record<BookSort, boolean> = { last: true, visits: true, name: false, owner: false, freq: false, next: false, distance: false }

/**
 * Customer briefing (Hub › Team, managers and admins): every customer by
 * province, 20 per page, with days since the last visit and by whom, visits
 * in 90 days, frequency, last outcome and the next planned visit. Filters
 * and sorting run in customer_book, the same data the Customers list uses.
 */
export function CustomerBriefingPage() {
  const desktop = useIsDesktop()
  const [province, setProvince] = useState(PHNOM_PENH)
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim())
  const [owner, setOwner] = useState<string>('')
  const [filter, setFilterRaw] = useState<CustomerFilter>(EMPTY_FILTER)
  const [sort, setSort] = useState<BookSort>('last')
  const [desc, setDesc] = useState(true)
  const [page, setPage] = useState(1)
  const [popOpen, setPopOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const visitors = useVisitors()
  const owners = useOwners()
  const names = useMemo(() => visitorNames(visitors), [visitors])

  // Any change to what's shown goes back to page 1.
  const setFilter = (f: CustomerFilter) => {
    setFilterRaw(f)
    setPage(1)
  }
  useEffect(() => setPage(1), [search, owner, province])

  const scope = { search, owner: owner || null, people: filter.people, mode: filter.mode, months: filter.months }
  const summaryRes = useBookSummary(scope)
  const summary = summarize(summaryRes.data, filter.ranges)
  const group = summary.provinces.find((p) => p.code === province)
  const rangeCountsHere = useMemo(() => {
    // Range counts for the chosen province only (the sheet / chips show what you'd get here).
    const out = Object.fromEntries(RANGES.map((r) => [r.key, 0])) as Record<Bucket, number>
    for (const r of summaryRes.data) if (r.province_code === province) out[r.bucket] += r.n
    return out
  }, [summaryRes.data, province])

  const res = useBookPage({ ...scope, province, ranges: filter.ranges, sort, desc, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const total = res.data.length ? res.total : res.loading || res.refreshing ? (group?.matching ?? 0) : 0
  const pg = pager(total, page)
  const km = group?.km ?? summaryRes.data.find((r) => r.province_code === province)?.province_name ?? ''
  const en = group?.en ?? ''
  const overall = summarize(summaryRes.data, [])
  const headline = `${overall.total.toLocaleString('en-US')} customers · ${overall.late.toLocaleString('en-US')} overdue, lapsed or never visited`

  const pickSort = (s: BookSort) => {
    if (s === sort) setDesc(!desc)
    else {
      setSort(s)
      setDesc(DEFAULT_DESC[s])
    }
    setPage(1)
  }

  const busy = (res.refreshing || summaryRes.refreshing) && !res.loading

  if (!desktop) {
    return (
      <div className="mx-auto max-w-lg pb-6">
        <div className="flex flex-col gap-2.5 border-b border-neutral-100 pb-2.5 pt-3 dark:border-neutral-800">
          <div role="radiogroup" aria-label="Province" className="flex gap-1.5 overflow-x-auto px-4 pb-0.5">
            {summary.provinces.map((p) => {
              const on = p.code === province
              return (
                <button
                  key={p.code}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setProvince(p.code)}
                  className={`h-[34px] shrink-0 whitespace-nowrap rounded-full border-[1.5px] bg-white px-3 text-[13px] font-bold ${on ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100' : 'border-neutral-200 text-neutral-600'}`}
                >
                  {p.en || p.km} <span className="font-semibold text-neutral-500">{p.matching.toLocaleString('en-US')}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 px-4">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-neutral-500">
              {activeCount(filter) || search || owner
                ? `${total.toLocaleString('en-US')} of ${(group?.total ?? 0).toLocaleString('en-US')} match`
                : `${(group?.total ?? 0).toLocaleString('en-US')} customers · ${group?.late ?? 0} overdue, lapsed or never visited`}
              {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-label="Updating" />}
            </p>
            <FilterButton filter={filter} onClick={() => setSheetOpen(true)} />
          </div>
          <div className="px-4">
            <FilterChips filter={filter} names={names} onChange={setFilter} />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-4 pt-3">
          <p className="mx-0.5 text-[15px] font-extrabold text-neutral-900">
            {km} <span className="text-[13px] font-semibold text-neutral-500">{en ? `${en} · ` : ''}sorted by longest since visit</span>
          </p>
          {res.error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{res.error}</p>}
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            {res.loading && <div className="m-3.5 h-16 animate-pulse rounded-xl bg-neutral-100" />}
            {res.data.map((c, i) => (
              <PhoneRow key={c.customer_id} row={c} first={i === 0} />
            ))}
            {!res.loading && res.data.length === 0 && <p className="px-3.5 py-7 text-center text-sm text-neutral-500">No customers match these filters.</p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(pg.page - 1)} disabled={pg.page <= 1} className="h-10 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3.5 text-[13.5px] font-bold text-neutral-600 disabled:opacity-40">
              ‹ Prev
            </button>
            <span className="flex-1 text-center text-[13px] tabular-nums text-neutral-500">
              {pg.label}
              <br />
              <span className="text-[11.5px]">
                Page {pg.page} of {pg.pages}
              </span>
            </span>
            <button type="button" onClick={() => setPage(pg.page + 1)} disabled={pg.page >= pg.pages} className="h-10 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3.5 text-[13.5px] font-bold text-neutral-600 disabled:opacity-40">
              Next ›
            </button>
          </div>
        </div>

        <CustomerFilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          filter={filter}
          onChange={setFilter}
          rangeCounts={rangeCountsHere}
          showCount={group?.matching ?? 0}
          visitors={visitors}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-2">
      <p className="text-xs text-neutral-500">{headline} · managers and admins only</p>
      <div className="flex min-h-0 gap-4">
        <aside aria-label="Provinces" className="flex max-h-[calc(100dvh-170px)] w-[220px] shrink-0 flex-col overflow-hidden rounded-[14px] bg-white shadow-card">
          <p className="px-3.5 pb-2 pt-3 text-[11px] font-extrabold uppercase tracking-[0.06em] text-neutral-500">Provinces</p>
          <div className="flex-1 overflow-y-auto">
            {summaryRes.loading && <div className="mx-3.5 h-40 animate-pulse rounded-xl bg-neutral-100" />}
            {summary.provinces.map((p) => {
              const on = p.code === province
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setProvince(p.code)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-2 border-l-[3px] px-3.5 py-2 text-left ${on ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/20' : 'border-transparent hover:bg-neutral-50'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13.5px] text-neutral-900 ${on ? 'font-extrabold' : 'font-semibold'}`}>{p.km}</span>
                    {p.en && <span className="block text-[11.5px] text-neutral-500">{p.en}</span>}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-neutral-600">{p.matching.toLocaleString('en-US')}</span>
                  <span className="min-w-[30px] rounded-full bg-status-danger/10 px-1.5 py-px text-center text-[11px] font-extrabold tabular-nums text-status-danger dark:bg-red-400/15 dark:text-red-300">{p.late}</span>
                </button>
              )
            })}
          </div>
          <p className="border-t border-neutral-100 px-3.5 py-2.5 text-[11.5px] text-neutral-500">Red = overdue (31–60 days), lapsed (60+) or never visited</p>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <p className="min-w-0 flex-1 truncate text-lg font-extrabold text-neutral-900">
              {km} <span className="text-sm font-semibold text-neutral-500">{en}</span>
            </p>
            <label className="flex h-[38px] w-60 items-center gap-2 rounded-[10px] border-[1.5px] border-neutral-200 bg-white px-2.5">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search in ${en || km}`}
                aria-label="Search customers"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </label>
            <select
              aria-label="Salesperson"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="h-[38px] rounded-[10px] border-[1.5px] border-neutral-200 bg-white px-2.5 text-[13.5px] text-neutral-900"
            >
              <option value="">All salespeople</option>
              {owners.map((o) => (
                <option key={o.user_id} value={o.user_id}>
                  {displayName(o.full_name, o.nickname)}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-extrabold uppercase tracking-wide text-neutral-500">Last visit</span>
            {RANGES.map((r) => {
              const on = filter.ranges.includes(r.key)
              return (
                <button
                  key={r.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setFilter({ ...filter, ranges: toggle(filter.ranges, r.key) })}
                  className={`flex h-[34px] items-center gap-1.5 rounded-full border-[1.5px] px-[11px] text-[13px] font-bold ${
                    on ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                  {r.label} <span className="font-semibold tabular-nums text-neutral-500">{rangeCountsHere[r.key].toLocaleString('en-US')}</span>
                </button>
              )
            })}
            <span className="mx-1 h-[22px] w-px bg-neutral-200" />
            <button
              type="button"
              onClick={() => setPopOpen(!popOpen)}
              aria-expanded={popOpen}
              className={`flex h-[34px] items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[13px] font-bold ${
                peopleActive(filter) ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              {peopleActive(filter) ? peopleLabel(filter, names) : 'Visited by: anyone'}
              <ChevronDown className="h-3 w-3" strokeWidth={3} />
            </button>
            {activeCount(filter) > 0 && (
              <button type="button" onClick={() => setFilter({ ...EMPTY_FILTER })} className="h-[34px] px-1.5 text-[13px] font-bold text-brand-500">
                Clear all
              </button>
            )}
            {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin text-neutral-400" aria-label="Updating" />}
            {popOpen && (
              <div role="dialog" aria-label="Visited by" className="absolute right-0 top-[42px] z-20 flex w-[360px] flex-col gap-2.5 rounded-[14px] border border-neutral-200 bg-white p-3.5 shadow-[0_12px_32px_rgba(0,0,0,.18)]">
                <PeoplePicker filter={filter} visitors={visitors} onChange={setFilter} variant="list" />
                <button type="button" onClick={() => setPopOpen(false)} className="h-[38px] rounded-[10px] bg-brand-500 text-[13.5px] font-bold text-white">
                  Done
                </button>
              </div>
            )}
          </div>

          {res.error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{res.error}</p>}

          <div role="table" aria-label={`Customers in ${en || km}`} className="flex flex-col overflow-hidden rounded-[14px] bg-white shadow-card">
            <div role="row" className={`${GRID} h-10 items-center border-b border-neutral-100 bg-neutral-50 px-4 dark:bg-neutral-900`}>
              {COLS.map((c) => {
                const on = c.sort === sort
                return (
                  <button
                    key={c.label}
                    type="button"
                    role="columnheader"
                    aria-sort={on ? (desc ? 'descending' : 'ascending') : 'none'}
                    disabled={!c.sort}
                    onClick={() => c.sort && pickSort(c.sort)}
                    className={`whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wide disabled:cursor-default ${c.right ? 'text-right' : 'text-left'} ${on ? 'text-neutral-900' : 'text-neutral-500'}`}
                  >
                    {c.label}
                    {on ? (desc ? ' ↓' : ' ↑') : ''}
                  </button>
                )
              })}
            </div>
            {res.loading && <div className="m-4 h-40 animate-pulse rounded-xl bg-neutral-100" />}
            {res.data.map((c, i) => (
              <TableRow key={c.customer_id} row={c} first={i === 0} />
            ))}
            {!res.loading && res.data.length === 0 && <p className="px-4 py-10 text-center text-sm text-neutral-500">No customers match these filters.</p>}
            <div className="flex h-[52px] items-center gap-1.5 border-t border-neutral-100 px-4">
              <span className="flex-1 text-[13px] tabular-nums text-neutral-500">{pg.label} · 20 per page</span>
              <button type="button" onClick={() => setPage(pg.page - 1)} disabled={pg.page <= 1} aria-label="Previous page" className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border-[1.5px] border-neutral-200 bg-white text-neutral-600 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageButtons(pg.pages, pg.page).map((b, i) =>
                b === '…' ? (
                  <span key={`gap${i}`} className="min-w-[34px] text-center text-[13px] font-bold text-neutral-400">
                    …
                  </span>
                ) : (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setPage(b)}
                    aria-current={b === pg.page ? 'page' : undefined}
                    className={`h-[34px] min-w-[34px] rounded-[9px] border-[1.5px] px-2 text-[13px] font-bold tabular-nums ${b === pg.page ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
                  >
                    {b}
                  </button>
                )
              )}
              <button type="button" onClick={() => setPage(pg.page + 1)} disabled={pg.page >= pg.pages} aria-label="Next page" className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border-[1.5px] border-neutral-200 bg-white text-neutral-600 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ownerName(r: BookRow): string {
  return r.owner_name ? displayName(r.owner_name, r.owner_nickname) : '—'
}

function TableRow({ row, first }: { row: BookRow; first: boolean }) {
  const u = URGENCY[urgency(row.days_since)]
  return (
    <Link role="row" to={`/customers/${row.customer_id}`} className={`${GRID} h-11 items-center px-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${first ? '' : 'border-t border-neutral-100'}`}>
      <span role="cell" className="min-w-0">
        <span className="block truncate text-[13.5px] font-bold text-neutral-900">{row.shop_name}</span>
        {row.district && <span className="block truncate text-[11.5px] text-neutral-500">{row.district}</span>}
      </span>
      <span role="cell" className="truncate text-[13px] text-neutral-600">
        {ownerName(row)}
      </span>
      <span role="cell" className="min-w-0">
        <span className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-bold ${u.chip}`}>{lastVisitText(row)}</span>
      </span>
      <span role="cell" className="text-right text-[13.5px] font-bold tabular-nums text-neutral-900">
        {row.visits_90}
      </span>
      <span role="cell" className="truncate text-[13px] text-neutral-600" title={freqText(row)}>
        {row.freq_days ? `~${row.freq_days} days` : row.visits_90 === 1 ? 'once' : '—'}
      </span>
      <span role="cell" className={`truncate text-[13px] ${row.last_order_status === 'Ordered' ? 'text-status-working dark:text-emerald-300' : 'text-neutral-600'}`}>
        {outcomeText(row)}
      </span>
      <span role="cell" className="truncate text-[13px] text-neutral-600">
        {row.next_visit ? shortDay(row.next_visit) : '—'}
      </span>
    </Link>
  )
}

function PhoneRow({ row, first }: { row: BookRow; first: boolean }) {
  const u = URGENCY[urgency(row.days_since)]
  // Skip the empty parts, so a never-visited shop doesn't read "0 visits · — · —".
  const stats = [row.visits_90 ? `${visitsText(row.visits_90)} in 90 days` : 'No visits in 90 days', freqText(row), outcomeText(row)].filter((x) => x !== '—')
  if (row.next_visit) stats.push(`next ${shortDay(row.next_visit)}`)
  return (
    <Link to={`/customers/${row.customer_id}`} className={`flex flex-col gap-1 px-3.5 py-2.5 ${first ? '' : 'border-t border-neutral-100'}`}>
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-neutral-900">{row.shop_name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${u.chip}`}>{lastVisitText(row)}</span>
      </span>
      <span className="text-xs text-neutral-500">{[row.district, ownerName(row)].filter(Boolean).join(' · ')}</span>
      <span className="text-xs text-neutral-600">{stats.join(' · ')}</span>
    </Link>
  )
}
