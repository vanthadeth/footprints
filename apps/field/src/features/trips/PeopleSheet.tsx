import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { busyText, lengthLabel } from './trip'
import { Avatar } from './TripParts'
import type { TripCandidate } from './tripService'

/**
 * Who's going: teammates with their role; anyone on leave or another trip
 * on the trip's dates is flagged (they can still be added -- the approver
 * sees it). The requester is always on the trip.
 */
export function PeopleSheet({
  open,
  onClose,
  candidates,
  loading,
  meId,
  selected,
  start,
  end,
  days,
  perRoom,
  onSave,
}: {
  open: boolean
  onClose: () => void
  candidates: TripCandidate[]
  loading: boolean
  meId: string
  selected: string[]
  start: string
  end: string
  days: number
  perRoom: number
  onSave: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<string[]>(selected)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) {
      setPicked(selected)
      setQ('')
    }
  }, [open, selected])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return candidates.filter((c) => !term || c.name.toLowerCase().includes(term) || c.full_name.toLowerCase().includes(term))
  }, [candidates, q])

  const toggle = (id: string) => {
    if (id === meId) return
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  const n = picked.length
  const rooms = Math.ceil(n / Math.max(perRoom, 1))
  const clashes = candidates.filter((c) => picked.includes(c.user_id) && busyText(c.busy, start, end))

  return (
    <BottomSheet open={open} onClose={onClose} title="Who’s going?">
      <div className="space-y-3 p-4">
        <p className="text-[13px] text-neutral-500">{lengthLabel(days, Math.max(days - 1, 0))}. Leave and other trips on these days are shown.</p>
        <label className="flex h-11 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-neutral-500">
          <Search className="h-4 w-4" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none" />
        </label>
        <div className="max-h-[40vh] overflow-y-auto">
          {loading && <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />}
          {list.map((c, i) => {
            const on = picked.includes(c.user_id)
            const me = c.user_id === meId
            const busy = busyText(c.busy, start, end)
            return (
              <button
                key={c.user_id}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={me}
                onClick={() => toggle(c.user_id)}
                className={`flex w-full items-center gap-3 py-2.5 text-left ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}
              >
                <Avatar name={c.full_name} i={i} size="h-10 w-10 text-[13px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-extrabold text-neutral-900">
                    {c.name}
                    {me ? ' (you)' : ''}
                  </span>
                  <span className="block truncate text-[12.5px] text-neutral-500">{c.role ?? '—'}</span>
                  <span className={`block text-[12.5px] font-bold ${busy ? 'text-status-warn' : me ? 'text-neutral-500' : 'text-status-working'}`}>
                    {me ? 'Requester · always on the trip' : busy || `Free all ${days} day${days === 1 ? '' : 's'}`}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${
                    on ? (me ? 'border-neutral-400 bg-neutral-400 text-white' : 'border-brand-500 bg-brand-500 text-white') : 'border-neutral-300 dark:border-neutral-600'
                  }`}
                >
                  {on && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>
        <div className="space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <p className="text-[13px] leading-snug text-neutral-600">
            {n} {n === 1 ? 'person' : 'people'} · {rooms} room{rooms === 1 ? '' : 's'} a night by default ({perRoom} share a room). Change rooms on any night in the plan.
          </p>
          {clashes.length > 0 && (
            <p role="note" className="rounded-xl bg-status-warn/10 px-3 py-2 text-[12.5px] leading-snug text-neutral-900">
              {clashes.map((c) => `${c.name}: ${busyText(c.busy, start, end)}`).join(' · ')}. You can still add them — the approver will see it.
            </p>
          )}
          <button type="button" onClick={() => onSave(picked)} className="h-12 w-full rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white">
            Done · {n} {n === 1 ? 'person' : 'people'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
