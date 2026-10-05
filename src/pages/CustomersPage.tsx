import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Construction, FileText, Loader2, Search, Store, UserRound } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { useCan } from '@/features/permissions/PermissionsContext'
import { SegmentedControl } from '@/components/SegmentedControl'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { locationService } from '@/features/location/locationService'
import { CUSTOMER_MANAGEMENT_ENABLED } from '@/lib/featureFlags'
import { displayName } from '@/lib/displayName'
import { formatDistance } from '@/lib/geo'
import type { BookRow, BookScope, Bucket } from '@/features/customers/customerBookService'
import { useBookGroup, useBookPage, useBookSummary, useDebounced, useVisitors } from '@/features/customers/useCustomerBook'
import { CustomerFilterSheet, FilterButton, FilterChips } from '@/features/customers/CustomerFilterSheet'
import { DUE_RANGES, EMPTY_FILTER, PAGE_SIZE, URGENCY, activeCount, lastVisitChip, summarize, urgency, visitorNames, type CustomerFilter, type ProvinceGroup } from '@/features/customers/book'
import { PHNOM_PENH } from '@/features/customers/provinces'

type Tab = 'all' | 'nearby' | 'due'

/** Groups this small open by themselves while searching or filtering. */
const AUTO_OPEN_MAX = 60

/**
 * The field-sales customer book, grouped by province. Counts come from
 * customer_book_summary and each open province loads 20 customers at a
 * time, so nothing here ever pulls the whole book -- that (and filtering
 * 2,000 rows on every keystroke) is what made the old list slow.
 */
export function CustomersPage() {
  if (!CUSTOMER_MANAGEMENT_ENABLED) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <Construction className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Customer management is temporarily unavailable.</p>
      </div>
    )
  }

  return <CustomersHome />
}

/**
 * Customers landing, as on the design canvas (Polish › Customers): my
 * customers with how recently each was visited (7 / 15 / 30 days, and green
 * within 45 days vs red), Mine / Briefing / All, then my customers nearby.
 * The full book stays one tap away (?view=all, or ?view=mine for just mine).
 */
function CustomersHome() {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const me = session?.user.id ?? null
  const view = params.get('view')
  if (view === 'all' || view === 'mine') return <CustomersList owner={view === 'mine' ? me : null} onHome={() => setParams({})} />
  return <MyCustomers me={me} onView={(v) => setParams({ view: v })} />
}

type VisitPick = 'b7' | 'b15' | 'b30' | 'green' | 'red' | null
const inPick = (d: number | null, p: VisitPick) =>
  p === null ? true : p === 'b7' ? d != null && d <= 7 : p === 'b15' ? d != null && d > 7 && d <= 15 : p === 'b30' ? d != null && d > 15 && d <= 30 : p === 'green' ? d != null && d <= 45 : d == null || d > 45

function MyCustomers({ me, onView }: { me: string | null; onView: (v: 'all' | 'mine') => void }) {
  const canBriefing = useCan('customer_briefing')
  const [pick, setPick] = useState<VisitPick>(null)
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null)
  const [positionError, setPositionError] = useState(false)
  const [preset, setPreset] = useState<PresetCustomer | null>(null)
  const mine = useBookPage({ owner: me, sort: 'last', limit: 1000 }, !!me)
  const near = useBookPage({ owner: me, sort: 'distance', lat: position?.latitude, lng: position?.longitude, limit: 1000 }, !!me && !!position)

  useEffect(() => {
    locationService
      .getCurrentPosition()
      .then((r) => setPosition({ latitude: r.latitude, longitude: r.longitude }))
      .catch(() => setPositionError(true))
  }, [])

  const rows = mine.data
  const count = (p: VisitPick) => rows.filter((r) => inPick(r.days_since, p)).length
  const total = rows.length
  const green = count('green')
  const list = (position ? near.data : rows).filter((r) => inPick(r.days_since, pick)).slice(0, 12)
  const buckets: { key: VisitPick; label: string }[] = [
    { key: 'b7', label: 'Within 7 days' },
    { key: 'b15', label: '8 – 15 days' },
    { key: 'b30', label: '16 – 30 days' },
  ]
  const tile = (on: boolean) => `rounded-[14px] text-left ${on ? 'border border-white/60 bg-white/[.16]' : 'border border-transparent bg-white/[.07]'}`
  const listTitle = pick ? `${{ b7: 'Visited within 7 days', b15: 'Visited 8 – 15 days ago', b30: 'Visited 16 – 30 days ago', green: 'Seen within 45 days', red: 'Not seen for 45+ days' }[pick]}${position ? ' · nearest first' : ''}` : position ? 'Nearby' : 'Longest since a visit'

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="flex flex-col gap-3.5 px-4 pt-1.5 md:px-8">
        <section aria-label="My customers" className="rounded-[22px] bg-brand-900 p-4 text-white">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-white/60">My customers</p>
              <p className="text-[44px] font-bold leading-[48px] tracking-tight">{mine.loading ? '…' : total.toLocaleString('en-US')}</p>
            </div>
            <p className="mb-1.5 text-right text-xs text-white/60">By last visit</p>
          </div>
          <div role="group" aria-label="Last visit" className="mt-3.5 grid grid-cols-3 gap-1.5">
            {buckets.map((b) => (
              <button key={b.key} type="button" aria-pressed={pick === b.key} onClick={() => setPick(pick === b.key ? null : b.key)} className={`${tile(pick === b.key)} px-2.5 pb-[9px] pt-2.5`}>
                <span className="block text-[22px] font-bold leading-[26px]">{count(b.key)}</span>
                <span className="mt-0.5 block text-[11px] leading-[14px] text-white/60">{b.label}</span>
              </button>
            ))}
          </div>
          <div aria-hidden className="mt-3.5 flex h-2 gap-[3px] overflow-hidden rounded-full">
            <span className="bg-[#17CB49]" style={{ width: total ? `${(green / total) * 100}%` : '0%' }} />
            <span className="flex-1 bg-[#F74141]" />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {(
              [
                ['green', green, 'Visited within 45 days', '#17CB49'],
                ['red', total - green, 'No visit for 45+ days', '#F74141'],
              ] as const
            ).map(([k, n, label, dot]) => (
              <button key={k} type="button" aria-pressed={pick === k} onClick={() => setPick(pick === k ? null : k)} className={`${tile(pick === k)} flex items-center gap-2.5 px-3 py-2.5`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dot }} />
                <span className="min-w-0">
                  <span className="block text-lg font-bold leading-[22px]">{n}</span>
                  <span className="block text-[11px] leading-[14px] text-white/60">{label}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onView('mine')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white">
            <UserRound className="h-4 w-4" aria-hidden /> Mine
          </button>
          {canBriefing ? (
            <Link to="/team/customers" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
              <FileText className="h-4 w-4" aria-hidden /> Briefing
            </Link>
          ) : (
            <span />
          )}
          <button type="button" onClick={() => onView('all')} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
            <Store className="h-4 w-4" aria-hidden /> All
          </button>
        </div>

        <section aria-label="Nearby customers">
          <div className="mx-0.5 mb-2 flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{listTitle}</p>
            {pick && (
              <button type="button" onClick={() => setPick(null)} className="text-[13px] font-bold text-brand-500">
                Show all
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            {(mine.loading || (position && near.loading && near.data.length === 0)) && <div className="m-3.5 h-12 animate-pulse rounded-xl bg-neutral-100" />}
            {!mine.loading && list.length === 0 && <p className="px-3.5 py-[18px] text-center text-[13px] text-neutral-500">{total === 0 ? 'No customers assigned to you yet' : 'None in this group'}</p>}
            {list.map((r, i) => (
              <HomeRow key={r.customer_id} row={r} first={i === 0} onVisit={setPreset} />
            ))}
          </div>
          {!position && positionError && <p className="mx-0.5 mt-2 text-xs text-neutral-500">Couldn’t get your location, so these are sorted by last visit.</p>}
        </section>
      </div>
      <VisitFlow open={!!preset} onClose={() => setPreset(null)} presetCustomer={preset} />
    </div>
  )
}

function HomeRow({ row, first, onVisit }: { row: BookRow; first: boolean; onVisit: (c: PresetCustomer) => void }) {
  const d = row.days_since
  const ok = d != null && d <= 45
  const ini = row.shop_name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className={`flex items-center gap-3 px-3.5 py-[11px] ${first ? '' : 'border-t border-neutral-100'}`}>
      <Link to={`/customers/${row.customer_id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-[13px] font-bold text-neutral-600">
          {ini}
          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-neutral-900 ${ok ? 'bg-[#17CB49]' : 'bg-[#F74141]'}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-neutral-900">{row.shop_name}</span>
          <span className="block truncate text-xs text-neutral-500">{[row.district, row.province_name].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="shrink-0 text-right">
          {row.distance_m != null && <span className="block text-[13px] font-bold text-neutral-600">{formatDistance(row.distance_m)}</span>}
          <span className={`block text-[11px] font-bold ${ok ? 'text-status-working' : 'text-status-danger'}`}>{d == null ? 'Never visited' : d === 0 ? 'Today' : `${d} days`}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onVisit({ id: row.customer_id, shopName: row.shop_name })}
        className="h-[34px] shrink-0 rounded-[10px] bg-brand-50 px-3 text-[13px] font-bold text-brand-500 tap-target"
      >
        Visit
      </button>
    </div>
  )
}

function CustomersList({ owner = null, onHome }: { owner?: string | null; onHome?: () => void }) {
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim())
  const [tab, setTab] = useState<Tab>('all')
  const [filter, setFilter] = useState<CustomerFilter>(EMPTY_FILTER)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Pages shown per province; 0 = closed by hand. Phnom Penh starts open.
  const [open, setOpen] = useState<Record<string, number>>({ [PHNOM_PENH]: 1 })
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null)
  const [positionError, setPositionError] = useState(false)
  const [preset, setPreset] = useState<PresetCustomer | null>(null)
  const visitors = useVisitors()
  const names = useMemo(() => visitorNames(visitors), [visitors])

  useEffect(() => {
    if (tab !== 'nearby' || position) return
    locationService
      .getCurrentPosition()
      .then((reading) => setPosition({ latitude: reading.latitude, longitude: reading.longitude }))
      .catch(() => setPositionError(true))
  }, [tab, position])

  const scope: BookScope = { search, owner, people: filter.people, mode: filter.mode, months: filter.months }
  // Due = not seen in two weeks or never; the filter's ranges narrow that further.
  const ranges: Bucket[] = tab === 'due' ? (filter.ranges.length ? filter.ranges.filter((r) => DUE_RANGES.includes(r)) : DUE_RANGES) : filter.ranges
  const nothingInTab = tab === 'due' && filter.ranges.length > 0 && ranges.length === 0
  const filtering = activeCount(filter) > 0

  const summaryRes = useBookSummary(scope)
  const summary = summarize(summaryRes.data, ranges)
  const groups = nothingInTab ? [] : summary.provinces.filter((g) => g.matching > 0)
  const matching = nothingInTab ? 0 : summary.matching

  // What each Last-visit option would show on this tab.
  const rangeCounts = tab === 'due' ? { ...summary.rangeCounts, '0-14': 0 } : summary.rangeCounts

  const nearby = useBookPage(
    { ...scope, ranges: filter.ranges, sort: 'distance', lat: position?.latitude, lng: position?.longitude, limit: PAGE_SIZE },
    tab === 'nearby' && !!position
  )

  const summaryLine =
    tab === 'nearby'
      ? position
        ? 'Nearest 20 to you'
        : positionError
          ? 'Couldn’t get your location'
          : 'Finding your location…'
      : search || filtering
        ? matching === 0
          ? 'No matches'
          : `${matching.toLocaleString('en-US')} ${matching === 1 ? 'match' : 'matches'} in ${groups.length} ${groups.length === 1 ? 'province' : 'provinces'}`
        : tab === 'due'
          ? `${matching.toLocaleString('en-US')} customers due, overdue or never visited`
          : `${summary.total.toLocaleString('en-US')} customers · ${summary.provinces.filter((p) => p.code !== 'none').length} provinces`

  function isOpen(g: ProvinceGroup): boolean {
    const set = open[g.code]
    if (set !== undefined) return set > 0
    return (!!search || filtering) && g.matching <= AUTO_OPEN_MAX
  }

  const showEmpty = tab === 'nearby' ? !!position && !nearby.loading && nearby.data.length === 0 && (!!search || filtering) : !summaryRes.loading && groups.length === 0

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="flex flex-col gap-2.5 border-b border-neutral-100 px-4 pb-2.5 pt-3 md:px-8 dark:border-neutral-800">
        {onHome && (
          <button type="button" onClick={onHome} className="inline-flex items-center gap-1 self-start text-sm font-bold text-brand-500">
            <ChevronLeft className="h-4 w-4" aria-hidden /> My customers
          </button>
        )}
        <div className="flex gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code, phone…"
              aria-label="Search customers"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </label>
          <FilterButton filter={filter} onClick={() => setSheetOpen(true)} />
        </div>
        <SegmentedControl
          ariaLabel="Customer filter"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All' },
            { value: 'nearby', label: 'Nearby' },
            { value: 'due', label: 'Due' },
          ]}
        />
        <FilterChips filter={filter} names={names} onChange={setFilter} />
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          {summaryLine}
          {(summaryRes.refreshing || nearby.refreshing) && !summaryRes.loading && <Loader2 className="h-3 w-3 animate-spin" aria-label="Updating" />}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-2.5 md:px-8">
        {summaryRes.error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{summaryRes.error}</p>}

        {tab !== 'nearby' &&
          (summaryRes.loading ? (
            <>
              <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            </>
          ) : (
            groups.map((g) => (
              <ProvinceCard
                key={g.code}
                group={g}
                scope={scope}
                ranges={ranges}
                sort={tab === 'due' ? 'last' : 'name'}
                expanded={isOpen(g)}
                pages={open[g.code] || 1}
                showBadge={tab !== 'due' && !filtering}
                onToggle={() => setOpen((o) => ({ ...o, [g.code]: isOpen(g) ? 0 : 1 }))}
                onMore={() => setOpen((o) => ({ ...o, [g.code]: (o[g.code] || 1) + 1 }))}
                onVisit={setPreset}
              />
            ))
          ))}

        {tab === 'nearby' && position && nearby.data.length > 0 && (
          <>
            <p className="mx-0.5 text-xs text-neutral-500">Closest first, across all provinces.</p>
            <div className="overflow-hidden rounded-2xl bg-white shadow-card">
              {nearby.data.map((c, i) => (
                <CustomerLine key={c.customer_id} row={c} first={i === 0} extra={c.distance_m != null ? `${formatDistance(c.distance_m)}` : undefined} onVisit={setPreset} />
              ))}
            </div>
          </>
        )}

        {showEmpty && (
          <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-200 px-4 py-7 text-center">
            <p className="text-[15px] font-bold text-neutral-900">{search ? `No customers match “${search}”` : 'No customers match these filters'}</p>
            <p className="mt-1 text-[13px] text-neutral-500">Try fewer filters, part of the shop name, the customer code or a phone number.</p>
          </div>
        )}
      </div>

      <CustomerFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filter={filter}
        onChange={setFilter}
        rangeCounts={rangeCounts}
        showCount={tab === 'nearby' ? summary.matching : matching}
        visitors={visitors}
      />

      <VisitFlow open={!!preset} onClose={() => setPreset(null)} presetCustomer={preset} />
    </div>
  )
}

function ProvinceCard({
  group,
  scope,
  ranges,
  sort,
  expanded,
  pages,
  showBadge,
  onToggle,
  onMore,
  onVisit,
}: {
  group: ProvinceGroup
  scope: BookScope
  ranges: Bucket[]
  sort: 'name' | 'last'
  expanded: boolean
  pages: number
  showBadge: boolean
  onToggle: () => void
  onMore: () => void
  onVisit: (c: PresetCustomer) => void
}) {
  const { rows, total, loading, error } = useBookGroup({ ...scope, province: group.code, ranges, sort }, pages, expanded)
  const count = total || group.matching
  const left = count - rows.length
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left tap-target">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold text-neutral-900">{group.km}</span>
          <span className="mt-px block text-xs text-neutral-500">
            {group.en ? `${group.en} · ` : ''}
            {group.matching.toLocaleString('en-US')} {group.matching === 1 ? 'customer' : 'customers'}
          </span>
        </span>
        {showBadge && group.late > 0 && (
          <span className="shrink-0 rounded-full bg-status-danger/10 px-2 py-0.5 text-[11px] font-extrabold text-status-danger">{group.late} to visit</span>
        )}
        <ChevronRight className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <>
          {error && <p className="border-t border-neutral-100 px-3.5 py-2 text-sm text-status-danger">{error}</p>}
          {rows.length === 0 && loading && <div className="mx-3.5 mb-3 h-12 animate-pulse rounded-xl bg-neutral-100" />}
          {rows.map((c) => (
            <CustomerLine key={c.customer_id} row={c} onVisit={onVisit} />
          ))}
          {left > 0 && rows.length > 0 && (
            <button type="button" onClick={onMore} disabled={loading} className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-neutral-100 text-[13.5px] font-bold text-brand-500">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Show {Math.min(PAGE_SIZE, left)} more · {left.toLocaleString('en-US')} left
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CustomerLine({ row, first = false, extra, onVisit }: { row: BookRow; first?: boolean; extra?: string; onVisit: (c: PresetCustomer) => void }) {
  const u = URGENCY[urgency(row.days_since)]
  const owner = row.owner_name ? displayName(row.owner_name, row.owner_nickname) : null
  const sub = [extra, row.district, owner].filter(Boolean).join(' · ')
  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${first ? '' : 'border-t border-neutral-100'}`}>
      <Link to={`/customers/${row.customer_id}`} className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold text-neutral-900">{row.shop_name}</span>
        {sub && <span className="mt-0.5 block truncate text-xs text-neutral-500">{sub}</span>}
        <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-bold ${u.chip}`}>{lastVisitChip(row)}</span>
      </Link>
      <button
        type="button"
        onClick={() => onVisit({ id: row.customer_id, shopName: row.shop_name })}
        className="h-[34px] shrink-0 rounded-[10px] bg-brand-50 px-3 text-[13px] font-bold text-brand-500 tap-target"
      >
        Visit
      </button>
    </div>
  )
}
