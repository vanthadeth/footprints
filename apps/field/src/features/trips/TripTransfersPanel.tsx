import { Link } from 'react-router-dom'
import { dayLabel, money } from './trip'
import type { TripRow } from './tripService'
import { TripTransferCard } from './TripTransferCard'
import { StatusPill } from './TripParts'
import { card } from './tripStyles'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')
const heading = 'px-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500'

/** One line per trip: who, dates, amount; opens the full trip. */
function TripLine({ trip, note }: { trip: TripRow; note?: string }) {
  return (
    <Link to={`/trips/${trip.id}`} className="flex items-center gap-3 px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-neutral-900">{trip.requester}</span>
        <span className="block truncate text-[12px] text-neutral-500">
          {dayLabel(trip.start_date)} – {dayLabel(trip.end_date)} · {trip.people_count} {trip.people_count === 1 ? 'person' : 'people'} · {money(trip.est_total)}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
      <StatusPill status={trip.status} />
    </Link>
  )
}

function List({ trips, note }: { trips: TripRow[]; note?: (t: TripRow) => string }) {
  return (
    <div className={`${card} divide-y divide-neutral-100 overflow-hidden dark:divide-neutral-800`}>
      {trips.map((t) => (
        <TripLine key={t.id} trip={t} note={note?.(t)} />
      ))}
    </div>
  )
}

/**
 * The accountant's view of sales trips: approved trips waiting for the
 * allowance transfer (each with its mark-as-transferred card), requested
 * trips still waiting for approval, and what was transferred recently.
 */
export function TripTransfersPanel({ trips, onChanged }: { trips: TripRow[]; onChanged: () => void }) {
  const toTransfer = trips.filter((t) => t.status === 'approved' && !t.transferred_at).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const requested = trips.filter((t) => t.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date))
  const done = trips.filter((t) => t.transferred_at).sort((a, b) => (b.transferred_at ?? '').localeCompare(a.transferred_at ?? '')).slice(0, 30)

  return (
    <div className="space-y-3.5">
      <p className={heading}>To transfer · {toTransfer.length}</p>
      {toTransfer.length === 0 ? (
        <p className={`${card} p-5 text-center text-[13.5px] text-neutral-500`}>No approved trips waiting for a transfer.</p>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
          {toTransfer.map((t) => (
            <div key={t.id} className={`${card} overflow-hidden`}>
              <TripLine trip={t} />
              <div className="border-t border-neutral-100 p-3 dark:border-neutral-800">
                <TripTransferCard trip={t} onDone={onChanged} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className={`${heading} pt-2`}>Requested · waiting for approval · {requested.length}</p>
      {requested.length === 0 ? <p className={`${card} p-4 text-center text-[13px] text-neutral-500`}>Nothing waiting for approval.</p> : <List trips={requested} />}

      <p className={`${heading} pt-2`}>Transferred · recent</p>
      {done.length === 0 ? <p className={`${card} p-4 text-center text-[13px] text-neutral-500`}>Nothing transferred yet.</p> : <List trips={done} note={(t) => `transferred ${when(t.transferred_at)}`} />}
    </div>
  )
}
