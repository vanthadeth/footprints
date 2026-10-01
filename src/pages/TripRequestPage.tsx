import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronRight, Home, Minus, Moon, Plus, X } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { displayName } from '@/lib/displayName'
import { customerBookService } from '@/features/customers/customerBookService'
import { calendarService } from '@/features/calendar/calendarService'
import {
  DEFAULT_RATES,
  HOME,
  SPECIAL_REASONS,
  addDays,
  busyText,
  costOf,
  dayLabel,
  earliestStart,
  hoursBefore,
  money,
  planTrip,
  provinceName,
  roomSplit,
  roomsFor,
  type SpecialLine,
  type TripDayInput,
  type TripRates,
} from '@/features/trips/trip'
import { tripDraftStore, tripErrorMessage, tripService, toDays, type TripCandidate, type TripDraft } from '@/features/trips/tripService'
import { ProvinceSheet, type ProvinceCounts } from '@/features/trips/ProvinceSheet'
import { PeopleSheet } from '@/features/trips/PeopleSheet'
import { Avatar, AvatarStack, Checks, CostCard, DayList, RoomsCard, RouteStrip } from '@/features/trips/TripParts'
import { card, kicker } from '@/features/trips/tripStyles'

const LONG_DAY_KM = 250
const emptyDay = (): TripDayInput => ({ provinces: [], night: null, rooms: null })

/** The next three Mondays from the earliest allowed start, for quick picks. */
function quickStarts(first: string): string[] {
  const out = [first]
  let d = addDays(first, 1)
  while (out.length < 3) {
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 1) out.push(d)
    d = addDays(d, 1)
  }
  return out
}

/**
 * New sales trip (and editing one that had changes asked): start date with
 * the notice rule, who's going, day by day -- provinces in visit order, the
 * overnight and hotel rooms, back to Phnom Penh on the last day -- special
 * allowance lines and the estimate, then Review and send for approval.
 * An unsent new trip is kept on this device as a draft.
 */
export function TripRequestPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const meId = profile?.id ?? ''
  const [rates, setRates] = useState<TripRates>(DEFAULT_RATES)
  const [draft, setDraft] = useState<TripDraft | null>(null)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [counts, setCounts] = useState<ProvinceCounts>({})
  const [candidates, setCandidates] = useState<TripCandidate[]>([])
  const [candLoading, setCandLoading] = useState(false)
  const [knownNames, setKnownNames] = useState<Record<string, string>>({})
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState<{ kind: 'day'; i: number } | { kind: 'people' } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState<string | null>(null)

  // Rates, then the trip being edited, the saved draft, or a fresh one.
  useEffect(() => {
    if (!meId) return
    let cancelled = false
    tripService
      .rates()
      .catch(() => DEFAULT_RATES)
      .then(async (r) => {
        if (cancelled) return
        setRates(r)
        if (id) {
          const t = (await tripService.mine()).find((x) => x.id === id)
          if (cancelled) return
          if (!t || t.user_id !== meId) return setError('That trip can’t be edited.')
          setDraft({ start: t.start_date, days: toDays(t), people: t.people.map((p) => p.user_id), special: t.specials.map((s) => ({ reason: s.reason, note: s.note ?? '', amount: s.amount })), note: t.note ?? '' })
          setKnownNames(Object.fromEntries(t.people.map((p) => [p.user_id, p.name])))
          setDecisionNote(t.status === 'changes' ? t.decision_note : null)
        } else {
          const saved = tripDraftStore.load()
          const first = earliestStart(r.noticeHours, r.leaveAt)
          setDraft(saved && saved.days?.length ? { ...saved, people: [meId, ...saved.people.filter((p) => p !== meId)] } : { start: first, days: [emptyDay()], people: [meId], special: [], note: '' })
        }
      })
      .catch((e) => !cancelled && setError(tripErrorMessage(e)))
    customerBookService
      .summary({})
      .then((rows) => {
        if (cancelled) return
        const c: ProvinceCounts = {}
        for (const row of rows) {
          const e = (c[row.province_code] ??= { total: 0, stale: 0 })
          e.total += row.n
          if (row.bucket === '60+' || row.bucket === 'never') e.stale += row.n
        }
        setCounts(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, meId])

  // Each step starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  // Keep an unsent new trip on this device.
  useEffect(() => {
    if (draft && !id) tripDraftStore.save(draft)
  }, [draft, id])

  const start = draft?.start ?? ''
  const end = draft ? addDays(draft.start, Math.max(draft.days.length - 1, 0)) : ''

  // Who could join (with leave / other trips) and holidays, for the trip's dates.
  useEffect(() => {
    if (!start || !meId) return
    let cancelled = false
    setCandLoading(true)
    tripService
      .candidates(start, end, id ?? null)
      .then((c) => !cancelled && setCandidates(c))
      .catch(() => {})
      .finally(() => !cancelled && setCandLoading(false))
    calendarService
      .items(meId, start, end)
      .then((items) => !cancelled && setHolidays(Object.fromEntries(items.filter((i) => i.kind === 'holiday').map((i) => [i.day, i.title]))))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [start, end, meId, id])

  const plan = useMemo(() => (draft ? planTrip(draft.start, draft.days) : null), [draft])
  const people = draft?.people.length ?? 1
  const cost = useMemo(() => (plan && draft ? costOf(plan, rates, people, draft.special) : null), [plan, draft, rates, people])

  if (error && !draft) return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-status-danger">{error}</p>
  if (!draft || !plan || !cost) return <div className="mx-auto mt-4 h-64 max-w-lg animate-pulse rounded-2xl bg-neutral-100 px-4" />

  const set = (patch: Partial<TripDraft>) => setDraft({ ...draft, ...patch })
  // Rooms can't exceed the people going.
  const setPeople = (ids: string[]) => set({ people: ids, days: draft.days.map((d) => (d.rooms == null ? d : { ...d, rooms: Math.min(d.rooms, Math.max(ids.length, 1)) })) })
  const setDay = (i: number, d: TripDayInput) => set({ days: draft.days.map((x, j) => (j === i ? d : x)) })
  const nameOf = (uid: string) =>
    uid === meId ? 'You' : candidates.find((c) => c.user_id === uid)?.name ?? knownNames[uid] ?? 'Someone'
  const fullNameOf = (uid: string) =>
    uid === meId ? (profile ? displayName(profile.full_name, profile.nickname) : 'You') : candidates.find((c) => c.user_id === uid)?.full_name ?? knownNames[uid] ?? '?'

  const first = earliestStart(rates.noticeHours, rates.leaveAt)
  const hrs = hoursBefore(draft.start, rates.leaveAt)
  const soon = hrs < rates.noticeHours
  const lastI = draft.days.length - 1
  const emptyAt = draft.days.findIndex((d) => d.provinces.length === 0)
  const noNightAt = draft.days.findIndex((d, i) => i < lastI && !d.night)
  const reasonMissing = rates.reasonRequired && draft.special.some((s) => !s.reason.trim())
  const ok = !soon && emptyAt < 0 && noNightAt < 0 && !reasonMissing
  const blocker = soon
    ? `Pick ${dayLabel(first)} or later to continue`
    : emptyAt >= 0
      ? `Add provinces to Day ${emptyAt + 1} to continue`
      : noNightAt >= 0
        ? `Pick where you sleep on Day ${noNightAt + 1}`
        : reasonMissing
          ? 'Give each special allowance a reason'
          : ''

  const addDay = () => {
    const days = draft.days.slice()
    const last = days[lastI]
    days[lastI] = { ...last, night: last.night ?? last.provinces[last.provinces.length - 1] ?? null }
    days.push(emptyDay())
    set({ days })
  }
  const removeDay = (i: number) => {
    const days = draft.days.filter((_, j) => j !== i)
    days[days.length - 1] = { ...days[days.length - 1], night: null, rooms: null }
    set({ days })
  }
  const setRooms = (i: number, v: number) => setDay(i, { ...draft.days[i], rooms: Math.max(1, Math.min(people, v)) })
  const setSpecial = (special: SpecialLine[]) => set({ special })
  const clashes = draft.people.filter((p) => p !== meId).map((p) => ({ name: nameOf(p), busy: busyText(candidates.find((c) => c.user_id === p)?.busy ?? [], start, end) })).filter((c) => c.busy)

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await tripService.request(draft, plan.days.map((d) => d.km), id ?? null)
      if (!id) tripDraftStore.clear()
      navigate(`/trips/${res.id}`, { replace: true })
    } catch (e) {
      setError(tripErrorMessage(e))
      setSending(false)
    }
  }

  if (step === 'review') {
    const hol = plan.days.find((d) => holidays[d.date])
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
        <div className="space-y-3 rounded-[20px] bg-brand-900 p-4 text-white">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-white/60">Sales trip · {plan.range}</p>
            <p className="mt-1 text-[24px] font-extrabold">{plan.length}</p>
          </div>
          <RouteStrip plan={plan} dark />
          <div className="grid grid-cols-3 gap-1.5 border-t border-white/15 pt-3">
            {[
              ['Provinces', String(plan.provinces.length)],
              ['Driving', `≈ ${plan.totalKm} km`],
              ['Longest day', `≈ ${plan.longest?.km ?? 0} km`],
            ].map(([l, v]) => (
              <span key={l}>
                <span className="block text-[11.5px] text-white/65">{l}</span>
                <span className="mt-0.5 block text-[17px] font-extrabold">{v}</span>
              </span>
            ))}
          </div>
        </div>

        <div className={`${card} flex items-center gap-3 p-3.5`}>
          <AvatarStack names={draft.people.map(fullNameOf)} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-extrabold text-neutral-900">
              {people} {people === 1 ? 'person' : 'people'} going
            </span>
            <span className="block truncate text-[12.5px] text-neutral-500">{draft.people.map(nameOf).join(', ')} · everyone gets the trip once approved</span>
          </span>
        </div>

        <DayList plan={plan} people={people} perRoom={rates.perRoom} />
        <RoomsCard plan={plan} people={people} perRoom={rates.perRoom} roomNights={cost.roomNights} />
        <CostCard cost={cost} people={people} special={draft.special} cap={rates.specialCap} />
        <Checks
          items={[
            soon ? { ok: false, text: `Too soon — trips must be sent at least ${rates.noticeHours} h before you leave` } : { ok: true, text: `Sent ${Math.floor(hrs / 24) ? `${Math.floor(hrs / 24)} days` : `${hrs} h`} before you leave — at least ${rates.noticeHours} h ahead` },
            clashes.length ? { ok: false, text: clashes.map((c) => `${c.name}: ${c.busy}`).join(' · ') } : { ok: true, text: 'Everyone is free — no leave or other trip on these days' },
            hol ? { ok: false, text: `${hol.label} is a public holiday (${holidays[hol.date]})` } : { ok: true, text: 'No public holidays' },
            (plan.longest?.km ?? 0) > LONG_DAY_KM ? { ok: false, text: `Day ${plan.longest!.n} is ≈ ${plan.longest!.km} km of driving` } : { ok: true, text: `Longest day ≈ ${plan.longest?.km ?? 0} km — under ${LONG_DAY_KM} km` },
          ]}
        />
        {draft.note && (
          <div className={`${card} p-3.5`}>
            <p className={kicker}>Purpose</p>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-900">{draft.note}</p>
          </div>
        )}
        <p className="px-1 text-[13px] leading-snug text-neutral-600">Goes to your Sales Manager. Any Sales Manager or Super Admin can approve it.</p>
        {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
        <button type="button" disabled={sending || !ok} onClick={send} className="h-[52px] w-full rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white disabled:opacity-60">
          {sending ? 'Sending…' : id ? 'Send again for approval' : 'Send for approval'}
        </button>
        <button type="button" onClick={() => setStep('edit')} className="h-11 w-full rounded-2xl text-sm font-bold text-brand-600">
          Edit trip
        </button>
        <p className="px-1 text-[12px] leading-relaxed text-neutral-500">
          Once approved, everyone on the trip can clock in away from their work locations on trip days, and the trip shows on their calendars.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3.5 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      {decisionNote && (
        <p className="rounded-2xl bg-status-warn/10 px-3.5 py-2.5 text-[13px] leading-snug text-neutral-900">
          <b>Changes asked:</b> “{decisionNote}”
        </p>
      )}

      <div className={`${card} space-y-2.5 p-3.5`}>
        <p className={kicker}>Leave Phnom Penh</p>
        <label className={`flex h-12 items-center gap-2.5 rounded-xl border-[1.5px] px-3 ${soon ? 'border-status-danger' : 'border-brand-500'}`}>
          <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden />
          <input
            type="date"
            value={draft.start}
            min={first}
            onChange={(e) => e.target.value && set({ start: e.target.value })}
            aria-label="Trip start date"
            className="min-w-0 flex-1 bg-transparent text-base font-extrabold text-neutral-900 outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {quickStarts(first).map((q, i) => (
            <button
              key={q}
              type="button"
              onClick={() => set({ start: q })}
              className={`h-8 rounded-full border-[1.5px] px-3 text-[12.5px] font-bold ${
                q === draft.start ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100' : 'border-neutral-200 text-neutral-600 dark:border-neutral-700'
              }`}
            >
              {i === 0 ? 'Earliest · ' : ''}
              {dayLabel(q)}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-neutral-600">
          <b className="text-neutral-900">{plan.length}</b> · {plan.back ? `back in Phnom Penh ${dayLabel(plan.end)}` : `ends ${dayLabel(plan.end)}`}
        </p>
        <p role={soon ? 'alert' : undefined} className={`text-[12.5px] leading-snug ${soon ? 'rounded-xl bg-status-danger/10 px-2.5 py-2 text-neutral-900' : 'text-neutral-500'}`}>
          {soon
            ? `Too soon: you’d leave in ${Math.max(hrs, 0)} h. Trips must be sent at least ${rates.noticeHours} h before you leave (${rates.leaveAt} on day 1). Earliest start: ${dayLabel(first)}.`
            : `Send at least ${rates.noticeHours} h before you leave at ${rates.leaveAt} — earliest start today is ${dayLabel(first)}.`}
        </p>
      </div>

      <div className={`${card} space-y-2.5 p-3.5`}>
        <div className="flex items-center justify-between">
          <p className={kicker}>Who’s going · {people}</p>
          <button type="button" onClick={() => setSheet({ kind: 'people' })} className="text-[13px] font-extrabold text-brand-600">
            + Add people
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.people.map((uid, i) => (
            <span key={uid} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 pl-1 pr-1.5 dark:border-neutral-700 dark:bg-neutral-800">
              <Avatar name={fullNameOf(uid)} i={i} size="h-7 w-7 text-[11px]" />
              <span className={`text-[13.5px] font-bold text-neutral-900 ${uid === meId ? 'pr-1.5' : ''}`}>{nameOf(uid)}</span>
              {uid !== meId && (
                <button type="button" aria-label={`Remove ${nameOf(uid)}`} onClick={() => setPeople(draft.people.filter((p) => p !== uid))} className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
        <p className="text-[12.5px] leading-snug text-neutral-500">
          {people === 1
            ? 'Just you · 1 room a night. Teammates you add get the trip on their calendar and can clock in on the route too.'
            : `${people} people · rooms default to ${rates.perRoom} per room — change any night below. Everyone gets the trip once it’s approved.`}
        </p>
        {clashes.length > 0 && <p className="rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] text-neutral-900">{clashes.map((c) => `${c.name}: ${c.busy}`).join(' · ')}</p>}
      </div>

      <div className="flex items-baseline justify-between px-0.5">
        <p className="text-[17px] font-extrabold text-neutral-900">Day by day</p>
        <span className="text-[12.5px] font-bold text-neutral-500">≈ {plan.totalKm} km driving</span>
      </div>

      <div>
        <div className="flex gap-2.5">
          <div className="flex w-[30px] flex-col items-center">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15">
              <Home className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-h-[14px] w-0.5 flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>
          <p className="mb-4 mt-1.5 text-[13.5px] text-neutral-600">
            <b className="text-neutral-900">Phnom Penh</b> · leave {dayLabel(draft.start)} at {rates.leaveAt}
          </p>
        </div>

        {plan.days.map((d, i) => {
          const empty = !d.provinces.length
          const warns: string[] = []
          if (holidays[d.date]) warns.push(`Public holiday — ${holidays[d.date]}. Visits are allowed, but many shops will be closed.`)
          if (d.km > LONG_DAY_KM) warns.push(`≈ ${d.km} km of driving. Consider another night on the way, or fewer stops.`)
          if (i < lastI && !d.night && !empty) warns.push('Pick where you sleep tonight.')
          const rooms = roomsFor(d, people, rates.perRoom)
          const split = roomSplit(people, rooms)
          return (
            <div key={i} className="flex gap-2.5">
              <div className="flex w-[30px] flex-col items-center">
                <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-extrabold ${empty ? 'border border-neutral-300 bg-white text-neutral-500 dark:border-neutral-600' : 'bg-status-visiting text-white'}`}>{d.n}</span>
                <span className="w-0.5 flex-1 bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <div className={`mb-3 min-w-0 flex-1 space-y-2.5 rounded-2xl bg-white p-3 shadow-card ${empty ? 'border-[1.5px] border-dashed border-neutral-300 dark:border-neutral-600' : warns.length ? 'border-[1.5px] border-status-warn' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[15px] font-extrabold text-neutral-900">
                    Day {d.n} · {d.label}
                  </span>
                  <span className={`text-[12px] font-bold ${d.km > LONG_DAY_KM ? 'text-status-warn' : 'text-neutral-500'}`}>{empty ? 'Not planned' : `≈ ${d.km} km`}</span>
                  {draft.days.length > 1 && (
                    <button type="button" aria-label={`Remove day ${d.n}`} onClick={() => removeDay(i)} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-neutral-500">Visit</span>
                  <div className="flex flex-wrap gap-1.5">
                    {d.provinces.map((c, j) => (
                      <button key={c} type="button" onClick={() => setSheet({ kind: 'day', i })} className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-status-visiting/10 pl-1 pr-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-status-visiting text-[11.5px] font-extrabold text-white">{j + 1}</span>
                        <span className="text-[13.5px] font-bold text-neutral-900">{provinceName(c)}</span>
                        {counts[c] && <span className="text-[11.5px] font-bold text-status-visiting dark:text-violet-300">{counts[c].total}</span>}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: 'day', i })}
                      className={`inline-flex h-[34px] items-center rounded-full border-[1.5px] border-dashed px-3 text-[13px] font-extrabold text-brand-600 ${empty ? 'border-brand-500' : 'border-neutral-300 dark:border-neutral-600'}`}
                    >
                      + {empty ? 'Add provinces to visit' : 'Province'}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => setSheet({ kind: 'day', i })} className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${d.back ? 'bg-brand-50 dark:bg-brand-500/15' : 'bg-neutral-50 dark:bg-neutral-800'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${d.back ? 'bg-brand-500 text-white' : 'bg-brand-900 text-amber-300'}`}>
                    {d.back ? <Home className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-bold text-neutral-500">{d.back ? (i === lastI ? 'End of trip' : 'Back home') : 'Overnight in'}</span>
                    <span className={`block text-[14.5px] font-extrabold ${d.back ? 'text-brand-700 dark:text-brand-100' : 'text-neutral-900'}`}>
                      {d.back ? (i === lastI ? 'Back to Phnom Penh' : 'Pick where you sleep') : provinceName(d.night!)}
                    </span>
                  </span>
                  <span className="text-[12px] font-bold text-neutral-500">{d.back ? (i === lastI ? 'evening' : '') : d.nightN > 1 ? `night ${d.nightN} here` : ''}</span>
                  <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
                </button>
                {d.night && (
                  <div className="flex items-center gap-2 pl-1.5">
                    <span className="min-w-0 flex-1 text-[13px] text-neutral-600">
                      <b className="text-neutral-900">
                        {rooms} room{rooms === 1 ? '' : 's'}
                      </b>{' '}
                      · {people === 1 ? 'just you' : rooms === 1 ? `all ${people} share` : `${people} people · ${split.join(' + ')}`}
                    </span>
                    <button type="button" aria-label={`Fewer rooms on day ${d.n}`} disabled={rooms <= 1} onClick={() => setRooms(i, rooms - 1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] border-neutral-200 text-neutral-600 disabled:opacity-30 dark:border-neutral-700">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-4 text-center text-[15px] font-extrabold tabular-nums text-neutral-900">{rooms}</span>
                    <button type="button" aria-label={`More rooms on day ${d.n}`} disabled={rooms >= people} onClick={() => setRooms(i, rooms + 1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] border-neutral-200 text-neutral-600 disabled:opacity-30 dark:border-neutral-700">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {warns.map((w) => (
                  <p key={w} role="note" className="flex items-start gap-2 rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
                    {w}
                  </p>
                ))}
              </div>
            </div>
          )
        })}

        <div className="flex gap-2.5">
          <div className="flex w-[30px] flex-col items-center">
            <span className="min-h-[8px] w-0.5 flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>
          <button type="button" onClick={addDay} disabled={draft.days.length >= 31} className="mb-3 h-11 flex-1 rounded-2xl border-[1.5px] border-dashed border-neutral-300 text-sm font-extrabold text-brand-600 disabled:opacity-40 dark:border-neutral-600">
            + Add a day
          </button>
        </div>
        <div className="flex gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-500 text-white">
            <Home className="h-4 w-4" aria-hidden />
          </span>
          <p className="mt-1.5 text-[13.5px] text-neutral-600">Back in Phnom Penh · {dayLabel(plan.end)} evening</p>
        </div>
      </div>

      {plan.provinces.length > 0 && (
        <Link to="/team/customers" className={`${card} flex items-center gap-3 p-3.5`}>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-neutral-900">
              {plan.provinces.length} province{plan.provinces.length === 1 ? '' : 's'} · {plan.provinces.reduce((a, c) => a + (counts[c]?.total ?? 0), 0)} customers on this route
            </span>
            <span className="block text-[12.5px] text-neutral-500">{plan.provinces.reduce((a, c) => a + (counts[c]?.stale ?? 0), 0)} not visited in 60+ days · see who before you go</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>
      )}

      <div className={`${card} space-y-2 p-3.5`}>
        <div className="flex items-baseline justify-between">
          <p className={kicker}>Special allowance</p>
          <span className="text-[13.5px] font-extrabold text-neutral-900">{draft.special.length ? money(cost.special) : 'None'}</span>
        </div>
        {draft.special.map((s, i) => (
          <div key={i} className={`flex items-center gap-2 py-1.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="shrink-0 rounded-full bg-earth-50 px-2 py-0.5 text-[11.5px] font-extrabold text-earth-500 dark:bg-amber-900/30 dark:text-amber-200">{s.reason}</span>
            <input
              value={s.note}
              onChange={(e) => setSpecial(draft.special.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              placeholder="Note for the approver"
              aria-label={`Note for ${s.reason}`}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <span className="flex items-center rounded-lg border-[1.5px] border-neutral-200 px-1.5 dark:border-neutral-700">
              <span className="text-[13px] text-neutral-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={Number.isFinite(s.amount) ? s.amount : ''}
                onChange={(e) => setSpecial(draft.special.map((x, j) => (j === i ? { ...x, amount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) } : x)))}
                aria-label={`Amount for ${s.reason}`}
                className="h-8 w-14 bg-transparent text-right text-sm font-extrabold tabular-nums text-neutral-900 outline-none"
              />
            </span>
            <button type="button" aria-label={`Remove ${s.reason}`} onClick={() => setSpecial(draft.special.filter((_, j) => j !== i))} className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!draft.special.length && <p className="text-[12.5px] leading-snug text-neutral-500">Nothing extra. Add costs the standard rates don’t cover — a ferry, parking, a customer event.</p>}
        <div className="flex flex-wrap gap-1.5">
          {SPECIAL_REASONS.map((r) => (
            <button
              key={r.reason}
              type="button"
              onClick={() => setSpecial([...draft.special, { reason: r.reason, note: '', amount: r.amount }])}
              className="h-[30px] rounded-full border-[1.5px] border-dashed border-neutral-300 px-2.5 text-[12.5px] font-bold text-brand-600 dark:border-neutral-600"
            >
              + {r.reason}
            </button>
          ))}
        </div>
        {cost.over && (
          <p role="alert" className="rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
            Special allowance is {money(cost.special)} — over the {money(rates.specialCap)} limit per trip. You can still send it; the approver will see it flagged.
          </p>
        )}
      </div>

      <button type="button" onClick={() => ok && setStep('review')} className={`${card} flex w-full items-center gap-3 p-3.5 text-left`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-earth-50 text-lg font-extrabold text-earth-500 dark:bg-amber-900/30 dark:text-amber-200">$</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-neutral-900">Estimated cost {money(cost.total)}</span>
          <span className="block text-[12.5px] text-neutral-500">
            {people > 1 ? `${money(cost.perPerson)} per person · ` : ''}allowance {money(cost.lines[0].value)} · hotel {cost.roomNights} room-nights {money(cost.lines[1].value)} · fuel {money(cost.lines[2].value)}
            {draft.special.length ? ` · special ${money(cost.special)}` : ''}
          </span>
        </span>
      </button>

      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-neutral-600">
          Purpose / note for your manager <span className="font-medium text-neutral-500">(optional)</span>
        </span>
        <textarea
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          rows={2}
          placeholder="What is this trip for?"
          className="w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-brand-500 dark:border-neutral-700"
        />
      </label>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      <button type="button" disabled={!ok} onClick={() => setStep('review')} className="h-[50px] w-full rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white disabled:bg-neutral-200 disabled:text-neutral-500 dark:disabled:bg-neutral-800">
        {ok ? 'Review trip' : blocker}
      </button>

      {sheet?.kind === 'day' && (
        <ProvinceSheet
          open
          onClose={() => setSheet(null)}
          title={`Day ${sheet.i + 1} · ${plan.days[sheet.i].label}`}
          from={sheet.i === 0 ? HOME : draft.days[sheet.i - 1].night ?? HOME}
          day={draft.days[sheet.i]}
          isLast={sheet.i === lastI}
          people={people}
          perRoom={rates.perRoom}
          counts={counts}
          onSave={(d) => {
            setDay(sheet.i, d)
            setSheet(null)
          }}
        />
      )}
      <PeopleSheet
        open={sheet?.kind === 'people'}
        onClose={() => setSheet(null)}
        candidates={candidates}
        loading={candLoading}
        meId={meId}
        selected={draft.people}
        start={start}
        end={end}
        days={draft.days.length}
        perRoom={rates.perRoom}
        onSave={(ids) => {
          setPeople([meId, ...ids.filter((x) => x !== meId)])
          setSheet(null)
        }}
      />
    </div>
  )
}
