import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { costOf, money, planTrip, provinceName, roomsFor, type TripRates } from './trip'
import { tripErrorMessage, tripRates, tripService, toDays, type TripRow } from './tripService'
import { Avatar, AvatarStack, RouteStrip } from './TripParts'
import { card } from './tripStyles'

/**
 * A sales trip waiting for a decision: who's going, the route, rooms,
 * special allowance (flagged over the limit) and the estimate, with
 * Approve / Ask to change / Reject. One decision covers everyone on it.
 */
export function TripApprovalCard({ trip, rates, onDecided }: { trip: TripRow; rates: TripRates; onDecided: () => void }) {
  const [asking, setAsking] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = planTrip(trip.start_date, toDays(trip))
  const n = trip.people_count
  const special = trip.specials
  const cost = costOf(plan, tripRates(trip, rates), n, special.map((s) => ({ reason: s.reason, note: s.note ?? '', amount: s.amount })), trip.fuel_amount)

  const decide = async (d: 'approved' | 'rejected' | 'changes') => {
    setBusy(true)
    setError(null)
    try {
      await tripService.decide(trip.id, d, note)
      onDecided()
    } catch (e) {
      setError(tripErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className={`${card} space-y-3 p-3.5`}>
      <div className="flex items-center gap-2.5">
        <Avatar name={trip.people[0]?.full_name ?? trip.requester} i={0} size="h-10 w-10 text-[13px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold text-neutral-900">{trip.requester}</span>
          <span className="block truncate text-[12.5px] text-neutral-500">{trip.requester_role ?? 'Sales'}</span>
        </span>
        <span className="rounded-full bg-earth-50 px-2 py-0.5 text-[11px] font-extrabold text-earth-500">Sales trip</span>
      </div>
      <div>
        <p className="text-base font-extrabold text-neutral-900">{plan.range}</p>
        <p className="text-[13px] text-neutral-600">{plan.length}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <AvatarStack names={trip.people.map((p) => p.full_name)} />
        <span className="min-w-0 flex-1 text-[13px] text-neutral-600">
          <b className="text-neutral-900">
            {n} {n === 1 ? 'person' : 'people'}
          </b>{' '}
          · {trip.people.map((p) => p.name).join(', ')}
        </span>
      </div>
      <RouteStrip plan={plan} />
      <div className="rounded-xl bg-neutral-50 px-3 py-1">
        {plan.days.map((d, i) => {
          const rooms = roomsFor(d, n, rates.perRoom)
          return (
            <p key={d.n} className={`flex gap-2.5 py-2 text-[13px] text-neutral-900 ${i ? 'border-t border-neutral-200/70 dark:border-neutral-700' : ''}`}>
              <b className="w-[68px] shrink-0 text-status-visiting">{d.label}</b>
              <span className="min-w-0 flex-1">
                {d.provinces.map(provinceName).join(', ')}{' '}
                <span className="text-neutral-500">{d.back ? '· back to Phnom Penh' : `· night in ${provinceName(d.night!)} · ${rooms} room${rooms === 1 ? '' : 's'}`}</span>
              </span>
            </p>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="rounded-xl bg-neutral-50 px-2.5 py-2">
          <span className="block text-lg font-extrabold text-neutral-900">{plan.provinces.length}</span>
          <span className="block text-[11.5px] text-neutral-500">provinces · ≈ {plan.totalKm} km</span>
        </span>
        <span className="rounded-xl bg-neutral-50 px-2.5 py-2">
          <span className="block text-lg font-extrabold text-neutral-900">{cost.roomNights}</span>
          <span className="block text-[11.5px] text-neutral-500">room-nights · {plan.nightCount} nights</span>
        </span>
        <span className="col-span-2 rounded-xl bg-earth-50 px-2.5 py-2">
          <span className="block text-lg font-extrabold text-earth-500">{money(trip.est_total)}</span>
          <span className="block text-[11.5px] text-neutral-500">
            estimated · {money(trip.est_total / Math.max(n, 1))} per person · {cost.lines.map((l) => `${l.label.toLowerCase()} ${money(l.value)}`).join(' · ')}
          </span>
        </span>
      </div>
      {special.length > 0 && (
        <div className={`rounded-xl px-3 py-2.5 ${cost.over ? 'bg-status-warn/10' : 'bg-neutral-50'}`}>
          <p className="flex justify-between text-[13px] font-extrabold text-neutral-900">
            <span>Special allowance</span>
            <span>{money(trip.special_total)}</span>
          </p>
          {special.map((s, i) => (
            <p key={i} className="mt-1 flex gap-2 text-[12.5px] text-neutral-600">
              <span className="min-w-0 flex-1">
                {s.reason}
                {s.note ? ` — ${s.note}` : ''}
              </span>
              <b className="text-neutral-900">{money(s.amount)}</b>
            </p>
          ))}
          {cost.over && <p className="mt-1.5 text-[12.5px] font-bold text-status-warn">Over the {money(rates.specialCap)} limit per trip by {money(trip.special_total - rates.specialCap)}</p>}
        </div>
      )}
      {trip.note && <p className="text-[13.5px] leading-snug text-neutral-600">“{trip.note}”</p>}
      <p className="text-[12.5px] leading-snug text-neutral-500">
        Approving adds the trip for all {n} {n === 1 ? 'person' : 'people'} — their calendars, and clock-in away from work locations from {plan.days[0]?.label} to {plan.days[plan.days.length - 1]?.label}.
      </p>

      {(asking || rejecting) && (
        <div className="space-y-2">
          <p className="text-[13px] font-extrabold text-neutral-900">{asking ? `What should ${trip.requester} change?` : 'Why reject it? (optional)'}</p>
          {asking && (
            <div className="flex flex-wrap gap-1.5">
              {['Shorter trip', 'Swap a province', 'Fewer rooms', 'Different dates'].map((s) => (
                <button key={s} type="button" onClick={() => setNote((v) => (v ? `${v} ${s}.` : `${s}.`))} className="h-[30px] rounded-full border-[1.5px] border-neutral-200 px-2.5 text-[12.5px] font-bold text-neutral-600 dark:border-neutral-700">
                  {s}
                </button>
              ))}
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl border-[1.5px] border-brand-500 bg-white px-3 py-2 text-sm text-neutral-900 outline-none dark:bg-neutral-900" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || (asking && !note.trim())} onClick={() => decide(asking ? 'changes' : 'rejected')} className={`h-11 flex-1 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 ${asking ? 'bg-brand-500' : 'bg-status-danger'}`}>
              {asking ? `Send back to ${trip.requester}` : 'Reject trip'}
            </button>
            <button type="button" onClick={() => { setAsking(false); setRejecting(false) }} className="h-11 rounded-xl border-[1.5px] border-neutral-200 px-4 text-sm font-bold text-neutral-600 dark:border-neutral-700">
              Back
            </button>
          </div>
        </div>
      )}
      {!asking && !rejecting && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => decide('approved')} className="h-11 flex-1 rounded-xl bg-status-working text-sm font-extrabold text-white disabled:opacity-50">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(true)} className="h-11 flex-1 rounded-xl border-[1.5px] border-neutral-200 text-sm font-bold text-neutral-900 dark:border-neutral-700">
            Ask to change
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="h-11 rounded-xl border-[1.5px] border-neutral-200 px-3 text-sm font-bold text-status-danger dark:border-neutral-700">
            Reject
          </button>
        </div>
      )}
      {error && <p className="text-sm text-status-danger">{error}</p>}
      <Link to={`/trips/${trip.id}`} className="flex items-center justify-end gap-1 text-[13px] font-bold text-brand-600">
        Full trip <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
