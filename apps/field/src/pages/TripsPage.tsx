import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useCan } from '@footprints/shared/features/permissions/PermissionsContext'
import { lengthLabel, money, ppToday, provinceName, dayLabel } from '@/features/trips/trip'
import { tripDraftStore, tripErrorMessage, tripService, type TripRow } from '@/features/trips/tripService'
import { HISTORY_FILTERS, historyKind, historyYears, monthGroups, splitTrips, type HistoryFilter } from '@/features/trips/tripLists'
import { AvatarStack, StatusPill } from '@/features/trips/TripParts'
import { TripRequestCard } from '@/features/trips/TripRequestCard'
import { useProvinceCounts } from '@/features/trips/useProvinceCounts'
import { card } from '@/features/trips/tripStyles'

type Tab = 'approve' | 'upcoming' | 'history'

const title = (t: TripRow) => {
  const provs = [...new Set(t.days.flatMap((d) => d.provinces))]
  return provs.slice(0, 2).map(provinceName).join(', ') + (provs.length > 2 ? ` +${provs.length - 2}` : '')
}

/**
 * Sales trips. Upcoming: the New trip button and your trips that are waiting,
 * need changes or are approved. History: past and closed trips by year, month
 * and outcome. Approvers also get "To approve": requests waiting for them,
 * opened in full before they decide.
 */
export function TripsPage() {
  const canRequest = useCan('sales_trip', 'add')
  const [trips, setTrips] = useState<TripRow[] | null>(null)
  const [team, setTeam] = useState<TripRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab | null>(null)
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [year, setYear] = useState<string | null>(null)
  const draft = tripDraftStore.load()
  const today = ppToday()
  const counts = useProvinceCounts()

  useEffect(() => {
    tripService
      .mine()
      .then(setTrips)
      .catch((e) => {
        setError(tripErrorMessage(e))
        setTrips([])
      })
    tripService.team().then(setTeam).catch(() => {
      // Not an approver, or the list is unavailable: no To approve tab.
    })
  }, [])

  const { upcoming, history } = useMemo(() => splitTrips(trips ?? [], today), [trips, today])
  const toApprove = useMemo(() => team.filter((t) => t.can_decide).sort((a, b) => a.start_date.localeCompare(b.start_date)), [team])
  const years = historyYears(history, today)
  const activeYear = year ?? years[0]
  const groups = monthGroups(history, activeYear, filter)
  const showApprove = toApprove.length > 0
  const active: Tab = tab === 'approve' && !showApprove ? 'upcoming' : (tab ?? (showApprove ? 'approve' : 'upcoming'))
  const draftReady = draft && draft.days.some((d) => d.provinces.length)

  const tabs: { key: Tab; label: string }[] = [
    ...(showApprove ? [{ key: 'approve' as const, label: `To approve · ${toApprove.length}` }] : []),
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'history', label: 'History' },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl lg:max-w-4xl md:px-8">
      <div role="tablist" aria-label="Trips" className="flex gap-0.5 rounded-xl bg-neutral-100 p-[3px] lg:max-w-xl">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key} onClick={() => setTab(t.key)} className={`h-10 flex-1 rounded-[9px] text-[13.5px] ${active === t.key ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      {trips === null && <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />}

      {active === 'approve' && (
        <>
          <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Waiting for you</p>
          {toApprove.map((t) => (
            <TripRequestCard key={t.id} trip={t} counts={counts} />
          ))}
        </>
      )}

      {active === 'upcoming' && trips && (
        <>
          {canRequest && (
            <Link to="/trips/new" className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[16px] font-bold text-white">
              <Plus className="h-5 w-5" aria-hidden /> {draftReady ? 'Continue your draft trip' : 'New trip'}
            </Link>
          )}
          {canRequest && draftReady && (
            <p className="px-1 text-[12.5px] text-neutral-500">
              Draft: {lengthLabel(draft.days.length, Math.max(draft.days.length - 1, 0))} from {dayLabel(draft.start)} · kept on this phone until you send it.
            </p>
          )}
          {upcoming.length === 0 ? (
            <div className={`${card} p-5 text-center`}>
              <p className="text-[15px] font-extrabold text-neutral-900">{history.length ? 'Nothing coming up' : 'No trips yet'}</p>
              <p className="mt-1 text-[13px] leading-snug text-neutral-500">Pick a start date, then where you’ll visit and sleep each day. Your Sales Manager approves it before you go.</p>
            </div>
          ) : (
            <>
              <p className="px-0.5 pt-1 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Upcoming · {upcoming.length}</p>
              <div className={`${card} px-3.5 py-0.5`}>
                {upcoming.map((t, i) => (
                  <TripRowItem key={t.id} trip={t} first={i === 0} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {active === 'history' && trips && (
        <>
          <div role="group" aria-label="Year" className="flex gap-1 rounded-xl bg-neutral-100 p-1">
            {years.map((y) => (
              <button key={y} type="button" aria-pressed={activeYear === y} onClick={() => setYear(y)} className={`h-[34px] flex-1 rounded-[10px] text-[13.5px] ${activeYear === y ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}>
                {y}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {HISTORY_FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`h-9 shrink-0 rounded-full border-[1.5px] px-3.5 text-[13.5px] ${filter === f.key ? 'border-brand-500 bg-brand-500 font-bold text-white' : 'border-neutral-300 font-semibold text-neutral-900 dark:border-neutral-600'}`}>
                {f.label}
              </button>
            ))}
          </div>
          {groups.length === 0 && (
            <div className={`${card} p-5 text-center`}>
              <p className="text-[15px] font-extrabold text-neutral-900">No trips here</p>
              <p className="mt-1 text-[13px] text-neutral-500">{filter === 'all' ? `You have no past trips in ${activeYear}.` : `No ${filter} trips in ${activeYear}.`}</p>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <p className="px-0.5 pb-1.5 pt-2 text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">{g.label}</p>
              <div className={`${card} px-3.5 py-0.5`}>
                {g.trips.map((t, i) => (
                  <TripRowItem key={t.id} trip={t} first={i === 0} faded={historyKind(t) !== 'done'} done />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

/** One trip: date tile, where, dates and length, who is with you and the total, and its status. */
function TripRowItem({ trip, first, faded = false, done = false }: { trip: TripRow; first: boolean; faded?: boolean; done?: boolean }) {
  const nights = trip.days.filter((d) => d.night).length
  const label = done && trip.status === 'approved' ? 'Done' : undefined
  return (
    <Link to={`/trips/${trip.id}`} className={`flex gap-3 py-3.5 ${first ? '' : 'border-t border-neutral-100 dark:border-neutral-800'} ${faded ? 'opacity-60' : ''}`}>
      <DateTile day={trip.start_date} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-extrabold leading-[21px] text-neutral-900">{title(trip)}</span>
        <span className="block text-[12.5px] text-neutral-500">
          {dayLabel(trip.start_date)} – {dayLabel(trip.end_date)} · {lengthLabel(trip.days.length, nights)}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[12.5px] text-neutral-500">
          <AvatarStack names={trip.people.map((p) => p.full_name)} />
          <span className="min-w-0 flex-1 truncate">
            {trip.room_nights ? `${trip.room_nights} room${trip.room_nights === 1 ? '' : 's'}` : 'No room'} · {money(trip.est_total)}
          </span>
          {label ? <span className="shrink-0 rounded-full bg-status-working/10 px-2 py-0.5 text-[11px] font-extrabold text-status-working">{label}</span> : <StatusPill status={trip.status} />}
        </span>
        {trip.status === 'changes' && trip.decision_note && (
          <span className="mt-2 block rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
            <b className="text-status-warn">{trip.decided_by ?? 'Manager'} asks:</b> {trip.decision_note}
          </span>
        )}
      </span>
    </Link>
  )
}

/** "NOV / 10" date tile, as on the canvas's trip list. */
function DateTile({ day }: { day: string }) {
  const d = new Date(`${day}T00:00:00Z`)
  return (
    <span className="flex h-[54px] w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-neutral-100 text-neutral-900 dark:bg-neutral-800">
      <span className="text-[19px] font-extrabold leading-[21px]">{d.getUTCDate()}</span>
      <span className="text-[11px] font-bold uppercase leading-none text-neutral-500">{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).slice(0, 3)}</span>
    </span>
  )
}
