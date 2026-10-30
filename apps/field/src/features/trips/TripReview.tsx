import { useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { costOf, planTrip, type TripRates } from './trip'
import { tripErrorMessage, tripRates, tripService, toDays, type TripRow } from './tripService'
import { approverChecks, yearSummary } from './tripLists'
import { Avatar, CostCard, DayPills, HeroStats, PeoplePills } from './TripParts'
import { useProvinceCounts } from './useProvinceCounts'
import { card, kicker } from './tripStyles'

/**
 * A trip request for its approver, in full before any decision: who and when,
 * checks, day by day, cost and purpose. Approve, Ask to change and Reject sit
 * in a bar at the bottom; one decision covers everyone on the trip.
 */
export function TripReview({ trip, rates, history, onDecided }: { trip: TripRow; rates: TripRates; history: TripRow[]; onDecided: () => void }) {
  const [sheet, setSheet] = useState<'change' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const counts = useProvinceCounts()
  const plan = planTrip(trip.start_date, toDays(trip))
  const n = trip.people_count
  const special = trip.specials.map((s) => ({ reason: s.reason, note: s.note ?? '', amount: s.amount }))
  const cost = costOf(plan, tripRates(trip, rates), n, special, trip.fuel_amount)
  const checks = approverChecks(trip, { noticeHours: rates.noticeHours, specialCap: rates.specialCap })
  const year = yearSummary(history, trip.user_id, trip.start_date.slice(0, 4))
  const first = trip.requester.split(' ')[0]
  const sent = new Date(trip.created_at)
  const sentText = `${sent.toDateString() === new Date().toDateString() ? 'sent today' : `sent ${sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}, ${sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

  const close = () => {
    setSheet(null)
    setNote('')
  }
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
    <div className="space-y-3">
      <div className="space-y-3 rounded-[20px] bg-brand-900 p-4 text-white">
        <div className="flex items-center gap-2.5">
          <Avatar name={trip.requester} i={0} size="h-[38px] w-[38px] text-[12px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold">{trip.requester}</span>
            <span className="block truncate text-[12.5px] text-white/75">
              {trip.requester_role ?? 'Sales'} · {sentText}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-[#FF9F2D] px-2.5 py-1 text-[11.5px] font-extrabold text-[#3b2100]">Waiting for you</span>
        </div>
        <div>
          <p className="text-[24px] font-extrabold leading-tight">{plan.range}</p>
          <p className="text-[13px] text-white/80">{plan.length}</p>
        </div>
        <HeroStats days={plan.days.length} provinces={plan.provinces.length} total={cost.total} />
        <div className="border-t border-white/15 pt-3">
          <PeoplePills names={trip.people.map((p) => p.name)} dark />
        </div>
      </div>

      <p className={`${kicker} px-0.5 pt-1`}>Checks</p>
      <div className={`${card} px-3.5 py-1`}>
        {checks.map((c, i) => (
          <div key={i} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.ok ? 'bg-status-working/10 text-status-working' : 'bg-status-warn/10 text-status-warn'}`}>{c.ok ? <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden /> : <TriangleAlert className="h-4 w-4" aria-hidden />}</span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-extrabold text-neutral-900">{c.title}</span>
              <span className="block text-[12.5px] text-neutral-500">{c.sub}</span>
            </span>
          </div>
        ))}
      </div>

      <p className={`${kicker} px-0.5 pt-1`}>Day by day · {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}</p>
      <DayPills plan={plan} people={n} perRoom={rates.perRoom} counts={counts} />

      <CostCard cost={cost} people={n} special={special} cap={rates.specialCap} title="Cost · rates when sent" />

      {trip.note && (
        <div className={`${card} p-3.5`}>
          <p className={kicker}>Purpose</p>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-900">{trip.note}</p>
        </div>
      )}

      <p className={`${kicker} px-0.5 pt-1`}>{first} this year</p>
      <div className={`${card} grid grid-cols-3 gap-2 p-3.5`}>
        {[
          [String(year.trips), year.trips === 1 ? 'trip' : 'trips'],
          [String(year.days), year.days === 1 ? 'day away' : 'days away'],
          [`$${Math.round(year.total).toLocaleString('en-US')}`, 'total spending'],
        ].map(([v, l]) => (
          <div key={l} className="min-w-0">
            <p className="truncate text-[22px] font-extrabold leading-7 text-neutral-900">{v}</p>
            <p className="text-[12px] text-neutral-500">{l}</p>
          </div>
        ))}
      </div>
      <p className="px-1 text-[12.5px] leading-snug text-neutral-500">
        Approving adds the trip for all {n} {n === 1 ? 'person' : 'people'}: their calendars, and clock-in away from work locations from {plan.days[0]?.label} to {plan.days[plan.days.length - 1]?.label}.
      </p>
      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-neutral-200 bg-neutral-50 px-4 py-3 md:bottom-0 md:-mx-8 md:px-8">
        <div className="grid grid-cols-[1.1fr_1.3fr_1fr] gap-2">
          <button type="button" disabled={busy} onClick={() => decide('approved')} className="h-[50px] rounded-[14px] bg-status-working text-sm font-extrabold text-white disabled:opacity-50">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => setSheet('change')} className="h-[50px] rounded-[14px] border-[1.5px] border-neutral-200 text-sm font-bold text-neutral-900 disabled:opacity-50 dark:border-neutral-700">
            Ask to change
          </button>
          <button type="button" disabled={busy} onClick={() => setSheet('reject')} className="h-[50px] rounded-[14px] border-[1.5px] border-status-danger text-sm font-bold text-status-danger disabled:opacity-50">
            Reject
          </button>
        </div>
      </div>

      <BottomSheet open={sheet === 'change'} onClose={close} title={`Ask ${first} to change`}>
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[13px] text-neutral-500">{first} gets your note and can edit and send the trip again.</p>
          <div className="flex flex-wrap gap-1.5">
            {['Shorter trip', 'Swap a province', 'Fewer rooms', 'Different dates'].map((s) => (
              <button key={s} type="button" onClick={() => setNote((v) => (v ? `${v} ${s}.` : `${s}.`))} className="h-9 rounded-full border-[1.5px] border-neutral-300 px-3 text-[13px] font-semibold text-neutral-900 dark:border-neutral-600">
                {s}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} aria-label="Note" className="w-full rounded-[14px] border-[1.5px] border-neutral-300 bg-white px-3.5 py-2.5 text-[14.5px] text-neutral-900 outline-none focus:border-brand-500 dark:border-neutral-600 dark:bg-neutral-900" />
          {!note.trim() && <p className="text-[12px] text-status-warn">Required</p>}
          <button type="button" disabled={busy || !note.trim()} onClick={() => decide('changes')} className="h-[52px] w-full rounded-2xl bg-brand-500 text-[16px] font-bold text-white disabled:opacity-50">
            Send back to {first}
          </button>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'reject'} onClose={close} title="Reject this trip?">
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[13px] text-neutral-500">
            {n > 1 ? `${first} and the others are` : `${first} is`} told it was not approved. {first} can start a new request.
          </p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Reason (optional)" aria-label="Reason" className="w-full rounded-[14px] border-[1.5px] border-neutral-300 bg-white px-3.5 py-2.5 text-[14.5px] text-neutral-900 outline-none focus:border-brand-500 dark:border-neutral-600 dark:bg-neutral-900" />
          <button type="button" disabled={busy} onClick={() => decide('rejected')} className="h-[52px] w-full rounded-2xl bg-status-danger text-[16px] font-bold text-white disabled:opacity-50">
            Reject trip
          </button>
          <button type="button" onClick={close} className="h-[52px] w-full rounded-2xl border-[1.5px] border-neutral-200 text-[16px] font-bold text-neutral-900 dark:border-neutral-700">
            Cancel
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
