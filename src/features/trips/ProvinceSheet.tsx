import { useEffect, useMemo, useState } from 'react'
import { Minus, Moon, Plus, Search } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SegmentedControl } from '@/components/SegmentedControl'
import { HOME, TRIP_PROVINCES, km, provinceName, roomsFor, type TripDayInput } from './trip'

export type ProvinceCounts = Record<string, { total: number; stale: number }>

/**
 * One sheet per trip day: tap provinces in the order you'll visit them
 * (nearest to where you slept first, or most customers to visit), then
 * where you sleep tonight and how many hotel rooms. The last day always
 * ends back in Phnom Penh.
 */
export function ProvinceSheet({
  open,
  onClose,
  title,
  from,
  day,
  isLast,
  people,
  perRoom,
  counts,
  onSave,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Where the day starts: last night's province, or Phnom Penh. */
  from: string
  day: TripDayInput
  isLast: boolean
  people: number
  perRoom: number
  counts: ProvinceCounts
  onSave: (day: TripDayInput) => void
}) {
  const [picked, setPicked] = useState<string[]>(day.provinces)
  const [night, setNight] = useState<string | null>(day.night)
  const [rooms, setRooms] = useState<number>(roomsFor(day, people, perRoom))
  const [sort, setSort] = useState<'near' | 'need'>('near')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) return
    setPicked(day.provinces)
    setNight(isLast ? null : day.night)
    setRooms(roomsFor(day, people, perRoom))
    setQ('')
  }, [open, day, isLast, people, perRoom])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return TRIP_PROVINCES.map((c) => ({ c, km: km(from, c), total: counts[c]?.total ?? 0, stale: counts[c]?.stale ?? 0 }))
      .filter((r) => !term || provinceName(r.c).toLowerCase().includes(term) || r.c.toLowerCase().includes(term))
      .filter((r) => sort !== 'need' || term || r.km <= 200)
      .sort((a, b) => (sort === 'need' ? b.stale - a.stale || a.km - b.km : a.km - b.km))
  }, [from, counts, sort, q])

  const toggle = (c: string) => {
    const next = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c]
    setPicked(next)
    if (!isLast && (!night || (!next.includes(night) && night !== from))) setNight(next[next.length - 1] ?? (from !== HOME ? from : null))
  }

  const nightOptions = [...new Set([...picked, ...(from !== HOME ? [from] : [])])]
  const ready = picked.length > 0 && (isLast || !!night)
  const fromName = from === HOME ? 'Phnom Penh' : provinceName(from)

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3 p-4">
        <p className="text-[13px] text-neutral-500">
          Starting from {fromName}
          {from === HOME ? '' : ', where you slept last night'}. Tap in the order you’ll visit.
        </p>
        <label className="flex h-11 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-neutral-500 dark:bg-neutral-800">
          <Search className="h-4 w-4" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search provinces" className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none" />
        </label>
        <SegmentedControl
          ariaLabel="Sort provinces"
          shape="tabs"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'near', label: 'Nearest first' },
            { value: 'need', label: 'Most to visit' },
          ]}
        />
        <p className="text-[12px] font-bold text-neutral-500">
          {sort === 'need' ? `Within 200 km of ${fromName} · most customers not visited in 60+ days first` : `Nearest to ${fromName} first · road distance, approximate`}
        </p>
        <div className="max-h-[34vh] overflow-y-auto">
          {list.map((r, i) => {
            const o = picked.indexOf(r.c)
            return (
              <button
                key={r.c}
                type="button"
                role="checkbox"
                aria-checked={o >= 0}
                onClick={() => toggle(r.c)}
                className={`flex w-full items-center gap-3 py-2.5 text-left ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[12.5px] font-extrabold ${
                    o >= 0 ? 'border-status-visiting bg-status-visiting text-white' : 'border-neutral-300 dark:border-neutral-600'
                  }`}
                >
                  {o >= 0 ? o + 1 : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[15px] font-extrabold text-neutral-900">{provinceName(r.c)}</span>
                    <span className="text-[12.5px] text-neutral-500">{r.km === 0 ? 'you’re here' : `≈ ${r.km} km`}</span>
                  </span>
                  <span className="block text-[12.5px] text-neutral-600">
                    {r.total} customers · <b className={r.stale >= 30 ? 'text-status-danger' : 'text-status-warn'}>{r.stale} not visited 60+ days</b>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="space-y-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          {isLast ? (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-[13px] text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">
              Last day: back to Phnom Penh in the evening. Add a day to stay another night.
            </p>
          ) : (
            <>
              <p className="text-[13px] font-extrabold text-neutral-900">Where will you sleep tonight?</p>
              <div role="radiogroup" aria-label="Overnight" className="flex flex-wrap gap-1.5">
                {nightOptions.length === 0 && <span className="text-[13px] text-neutral-500">Pick a province first.</span>}
                {nightOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={night === c}
                    onClick={() => setNight(c)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[13px] font-bold ${
                      night === c ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100' : 'border-neutral-200 text-neutral-600 dark:border-neutral-700'
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" aria-hidden />
                    {provinceName(c)}
                  </button>
                ))}
              </div>
              {night && (
                <div className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-neutral-900">Hotel rooms tonight</span>
                    <span className="block text-[12px] text-neutral-500">
                      {people === 1 ? 'Just you' : rooms === 1 ? `All ${people} share one room` : `${people} people · ${perRoom} per room by default`}
                    </span>
                  </span>
                  <button type="button" aria-label="Fewer rooms" disabled={rooms <= 1} onClick={() => setRooms(rooms - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-neutral-200 bg-white text-neutral-600 disabled:opacity-30 dark:border-neutral-700">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-5 text-center text-base font-extrabold tabular-nums text-neutral-900">{rooms}</span>
                  <button type="button" aria-label="More rooms" disabled={rooms >= people} onClick={() => setRooms(rooms + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-neutral-200 bg-white text-neutral-600 disabled:opacity-30 dark:border-neutral-700">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
          <button
            type="button"
            disabled={!ready}
            onClick={() => onSave({ provinces: picked, night: isLast ? null : night, rooms: isLast || !night ? null : rooms })}
            className="h-12 w-full rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white disabled:bg-neutral-200 disabled:text-neutral-500 dark:disabled:bg-neutral-800"
          >
            {picked.length ? `Save · ${picked.length} province${picked.length === 1 ? '' : 's'}${night && !isLast ? `, ${provinceName(night)} · ${rooms} room${rooms === 1 ? '' : 's'}` : ''}` : 'Pick at least one province'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
