import { Check, SlidersHorizontal, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SegmentedControl } from '@/components/SegmentedControl'
import type { Bucket, Visitor } from './customerBookService'
import { EMPTY_FILTER, MONTHS, RANGES, activeCount, filterChips, peopleHint, removeChip, toggle, visitorNames, type CustomerFilter } from './book'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

/** The Filter button with its active-count badge. */
export function FilterButton({ filter, onClick }: { filter: CustomerFilter; onClick: () => void }) {
  const n = activeCount(filter)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filter customers, ${n} active`}
      className={`flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] px-3 text-sm font-bold tap-target ${
        n ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' : 'border-neutral-200 bg-white text-neutral-600'
      }`}
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filter
      {n > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-extrabold text-white">{n}</span>}
    </button>
  )
}

/** Applied filters as removable chips, plus Clear all. */
export function FilterChips({ filter, names, onChange }: { filter: CustomerFilter; names: Record<string, string>; onChange: (f: CustomerFilter) => void }) {
  const chips = filterChips(filter, names)
  if (!chips.length) return null
  return (
    <div aria-label="Applied filters" className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(removeChip(filter, c.key))}
          aria-label={`Remove filter ${c.label}`}
          className="flex h-[30px] items-center gap-1.5 rounded-full bg-brand-50 px-2.5 text-[12.5px] font-bold text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"
        >
          {c.label}
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      ))}
      <button type="button" onClick={() => onChange({ ...EMPTY_FILTER })} className="h-[30px] px-1.5 text-[12.5px] font-bold text-brand-500">
        Clear all
      </button>
    </div>
  )
}

/** Visited / Not visited, who, and over how many months -- shared by the sheet and the briefing's popover. */
export function PeoplePicker({
  filter,
  visitors,
  onChange,
  variant = 'chips',
}: {
  filter: CustomerFilter
  visitors: Visitor[]
  onChange: (f: CustomerFilter) => void
  variant?: 'chips' | 'list'
}) {
  const names = visitorNames(visitors)
  const options = [{ id: null as string | null, name: 'Anyone' }, ...visitors.map((v) => ({ id: v.user_id as string | null, name: names[v.user_id] }))]
  return (
    <div className="flex flex-col gap-2.5">
      <SegmentedControl
        shape="tabs"
        ariaLabel="Visited or not visited"
        value={filter.mode}
        onChange={(mode) => onChange({ ...filter, mode })}
        options={[
          { value: 'visited', label: 'Visited' },
          { value: 'not', label: 'Not visited' },
        ]}
      />
      <div className={variant === 'chips' ? 'flex flex-wrap gap-1.5' : 'flex flex-col'}>
        {options.map((o) => {
          const on = o.id === null ? filter.people.length === 0 : filter.people.includes(o.id)
          const pick = () => onChange({ ...filter, people: o.id === null ? [] : toggle(filter.people, o.id) })
          if (variant === 'list') {
            return (
              <button key={o.id ?? 'anyone'} type="button" role="checkbox" aria-checked={on} onClick={pick} className="flex h-[38px] items-center gap-2.5 rounded-lg px-1.5 text-left text-[13.5px] font-semibold text-neutral-900 hover:bg-neutral-50">
                <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-300'}`}>
                  {on && <Check className="h-3 w-3" strokeWidth={3.5} />}
                </span>
                {o.id && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[10px] font-extrabold text-white">{initials(o.name)}</span>}
                {o.name}
              </button>
            )
          }
          return (
            <button
              key={o.id ?? 'anyone'}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={pick}
              className={`flex h-9 items-center gap-1.5 rounded-full border-[1.5px] pr-3 text-[13px] font-bold ${o.id ? 'pl-1' : 'pl-3'} ${
                on ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              {o.id && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[10px] font-extrabold text-white">{initials(o.name)}</span>}
              {o.id ? o.name.split(' ')[0] : o.name}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-[12.5px] font-bold text-neutral-600">In the last</p>
      <SegmentedControl
        shape="tabs"
        ariaLabel="Period"
        value={String(filter.months)}
        onChange={(m) => onChange({ ...filter, months: Number(m) })}
        options={MONTHS.map((m) => ({ value: String(m), label: `${m} ${m === 1 ? 'month' : 'months'}` }))}
      />
      <p className="text-xs text-neutral-500">{peopleHint(filter, names)}</p>
    </div>
  )
}

/** The phone filter: last-visit ranges (any of) and the people section, applied live. */
export function CustomerFilterSheet({
  open,
  onClose,
  filter,
  onChange,
  rangeCounts,
  showCount,
  visitors,
}: {
  open: boolean
  onClose: () => void
  filter: CustomerFilter
  onChange: (f: CustomerFilter) => void
  rangeCounts: Record<Bucket, number>
  showCount: number
  visitors: Visitor[]
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Filter customers">
      <div className="flex flex-col gap-5 px-4 py-4">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-extrabold text-neutral-900">
            Last visit <span className="font-semibold text-neutral-500">· pick one or more</span>
          </p>
          {RANGES.map((r) => {
            const on = filter.ranges.includes(r.key)
            return (
              <button
                key={r.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange({ ...filter, ranges: toggle(filter.ranges, r.key) })}
                className={`flex h-[46px] items-center gap-2.5 rounded-xl border-[1.5px] px-3 text-left ${
                  on ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/20' : 'border-neutral-200 bg-white'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-300'}`}>
                  {on && <Check className="h-3 w-3" strokeWidth={3.5} />}
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />
                <span className="flex-1 text-sm font-bold text-neutral-900">{r.label}</span>
                <span className="text-[13px] font-bold tabular-nums text-neutral-600">{rangeCounts[r.key].toLocaleString('en-US')}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-extrabold text-neutral-900">Visited by</p>
          <PeoplePicker filter={filter} visitors={visitors} onChange={onChange} />
        </div>
      </div>
      <div className="sticky bottom-0 flex gap-2 border-t border-neutral-100 bg-white px-4 pb-6 pt-3">
        <button type="button" onClick={() => onChange({ ...EMPTY_FILTER })} className="h-12 rounded-2xl border-[1.5px] border-neutral-200 bg-white px-4 text-[15px] font-bold text-neutral-600">
          Clear all
        </button>
        <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white">
          Show {showCount.toLocaleString('en-US')} {showCount === 1 ? 'customer' : 'customers'}
        </button>
      </div>
    </BottomSheet>
  )
}
