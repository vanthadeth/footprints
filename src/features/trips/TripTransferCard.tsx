import { useState } from 'react'
import { money } from './trip'
import { tripErrorMessage, tripService, type TripRow } from './tripService'
import { card, kicker } from './tripStyles'

/** "12 Oct" style date for the transfer line. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * The accountant's step on an approved trip: transfer the estimate to the
 * requester, then mark it with an optional reference. Once marked it only
 * shows who did it and when.
 */
export function TripTransferCard({ trip, onDone }: { trip: TripRow; onDone: () => void }) {
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (trip.transferred_at) {
    return (
      <div className={`${card} p-3.5`}>
        <p className={kicker}>Allowance transferred</p>
        <p className="mt-1 text-[14px] font-extrabold text-status-working">
          {money(trip.est_total)} · {day(trip.transferred_at)}
          {trip.transferred_by ? ` · by ${trip.transferred_by}` : ''}
        </p>
        {trip.transfer_ref && <p className="mt-0.5 text-[12.5px] text-neutral-600">Ref: {trip.transfer_ref}</p>}
      </div>
    )
  }
  if (!trip.can_transfer) return null

  const mark = async () => {
    setBusy(true)
    setError(null)
    try {
      await tripService.markTransferred(trip.id, ref)
      onDone()
    } catch (e) {
      setError(tripErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className={`${card} space-y-2.5 p-3.5`}>
      <p className={kicker}>Transfer allowance</p>
      <p className="text-[14px] text-neutral-900">
        Transfer <b>{money(trip.est_total)}</b> to {trip.requester} ({trip.people_count} {trip.people_count === 1 ? 'person' : 'people'}), then mark it done.
      </p>
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Reference (optional)"
        aria-label="Transfer reference"
        className="h-11 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button type="button" disabled={busy} onClick={mark} className="h-11 w-full rounded-xl bg-status-working text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? 'Marking…' : 'Mark as transferred'}
      </button>
      {error && <p className="text-sm text-status-danger">{error}</p>}
    </div>
  )
}
