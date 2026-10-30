import { useEffect, useMemo, useState } from 'react'
import { MoneyInput } from '@/components/MoneyInput'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronRight, Moon, Plus, X } from 'lucide-react'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { displayName } from '@footprints/shared/lib/displayName'
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
  initials,
  hoursBefore,
  money,
  planTrip,
  ppToday,
  provinceName,
  roomsFor,
  type SpecialLine,
  type TripDayInput,
  type TripRates,
} from '@/features/trips/trip'
import { tripDraftStore, tripErrorMessage, tripService, toDays, type TripCandidate, type TripDraft } from '@/features/trips/tripService'
import { ProvinceSheet, type ProvinceCounts } from '@/features/trips/ProvinceSheet'
import { PeopleSheet } from '@/features/trips/PeopleSheet'
import { LONG_DAY_KM, Checks, CostCard, DayPills, HeroStats, PeoplePills, ProvincePill } from '@/features/trips/TripParts'
import { card } from '@/features/trips/tripStyles'

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
  // Special allowance lines whose amount is empty; removing a line remounts the rest (specialRev) so they report again.
  const [badAmounts, setBadAmounts] = useState<Set<number>>(new Set())
  const [specialRev, setSpecialRev] = useState(0)
  const [fuelOk, setFuelOk] = useState(true)

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
          setDraft({ start: t.start_date, days: toDays(t), people: t.people.map((p) => p.user_id), special: t.specials.map((s) => ({ reason: s.reason, note: s.note ?? '', amount: s.amount })), fuel: t.fuel_amount || null, note: t.note ?? '' })
          setKnownNames(Object.fromEntries(t.people.map((p) => [p.user_id, p.name])))
          setDecisionNote(t.status === 'changes' ? t.decision_note : null)
        } else {
          const saved = tripDraftStore.load()
          const first = earliestStart(r.noticeHours, r.leaveAt)
          setDraft(saved && saved.days?.length ? { ...saved, fuel: saved.fuel ?? null, people: [meId, ...saved.people.filter((p) => p !== meId)] } : { start: first, days: [emptyDay()], people: [meId], special: [], fuel: null, note: '' })
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
  const cost = useMemo(() => (plan && draft ? costOf(plan, rates, people, draft.special, draft.fuel ?? 0) : null), [plan, draft, rates, people])

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
  const ok = !soon && emptyAt < 0 && noNightAt < 0 && !reasonMissing && badAmounts.size === 0 && fuelOk
  const blocker = soon
    ? `Pick ${dayLabel(first)} or later to continue`
    : emptyAt >= 0
      ? `Add provinces to Day ${emptyAt + 1} to continue`
      : noNightAt >= 0
        ? `Pick where you sleep on Day ${noNightAt + 1}`
        : reasonMissing
          ? 'Give each special allowance a reason'
          : badAmounts.size
            ? 'Enter each special allowance amount'
            : !fuelOk
              ? 'Fix the fuel amount'
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
  const setSpecial = (special: SpecialLine[]) => set({ special })
  const removeSpecial = (i: number) => {
    setSpecial(draft.special.filter((_, j) => j !== i))
    setBadAmounts(new Set())
    setSpecialRev((r) => r + 1)
  }
  const amountValid = (i: number) => (ok: boolean) =>
    setBadAmounts((prev) => {
      if (ok !== prev.has(i)) return prev
      const next = new Set(prev)
      if (ok) next.delete(i)
      else next.add(i)
      return next
    })
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

  const leaveIn = Math.max(Math.round((new Date(`${draft.start}T00:00:00Z`).getTime() - new Date(`${ppToday()}T00:00:00Z`).getTime()) / 86_400_000), 0)
  const longDate = new Date(`${draft.start}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const sub = 'text-[12px] font-extrabold uppercase tracking-wide text-neutral-500'

  if (step === 'review') {
    const hol = plan.days.find((d) => holidays[d.date])
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl lg:max-w-4xl md:px-8">
        <p className="px-0.5 text-[12.5px] text-neutral-500">Step 2 of 2 · Check and send</p>
        <div className="space-y-3 rounded-[20px] bg-brand-900 p-4 text-white">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-white/60">New sales trip</p>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-extrabold">Not sent yet</span>
          </div>
          <div>
            <p className="text-[24px] font-extrabold leading-tight">{plan.range}</p>
            <p className="text-[13px] text-white/80">Leaves Phnom Penh {longDate.split(' ').slice(0, 3).join(' ')}</p>
          </div>
          <HeroStats days={plan.days.length} provinces={plan.provinces.length} total={cost.total} />
          <div className="border-t border-white/15 pt-3">
            <PeoplePills names={draft.people.map(nameOf)} dark />
          </div>
        </div>

        <p className={`${sub} px-0.5 pt-1`}>Day by day · {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}</p>
        <DayPills plan={plan} people={people} perRoom={rates.perRoom} counts={counts} />
        <CostCard cost={cost} people={people} special={draft.special} cap={rates.specialCap} title="Cost · rates today" />
        <p className={`${sub} px-0.5 pt-1`}>Checks</p>
        <Checks
          items={[
            soon ? { ok: false, text: `Too soon — trips must be sent at least ${rates.noticeHours} h before you leave` } : { ok: true, text: `Sent ${Math.floor(hrs / 24) ? `${Math.floor(hrs / 24)} days` : `${hrs} h`} before you leave — at least ${rates.noticeHours} h ahead` },
            clashes.length ? { ok: false, text: clashes.map((c) => `${c.name}: ${c.busy}`).join(' · ') } : { ok: true, text: 'Everyone is free — no leave or other trip on these days' },
            hol ? { ok: false, text: `${hol.label} is a public holiday (${holidays[hol.date]})` } : { ok: true, text: 'No public holidays' },
            (plan.longest?.km ?? 0) > LONG_DAY_KM ? { ok: false, text: `Day ${plan.longest!.n} is ≈ ${plan.longest!.km} km of driving` } : { ok: true, text: `Longest day ≈ ${plan.longest?.km ?? 0} km — under ${LONG_DAY_KM} km` },
          ]}
        />
        {draft.note && (
          <>
            <p className={`${sub} px-0.5 pt-1`}>Purpose</p>
            <div className={`${card} p-3.5`}>
              <p className="text-sm leading-relaxed text-neutral-900">{draft.note}</p>
            </div>
          </>
        )}
        <p className="px-1 text-[13px] leading-snug text-neutral-600">Goes to your Sales Manager. Any Sales Manager or Super Admin can approve it.</p>
        {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
        <button type="button" disabled={sending || !ok} onClick={send} className="h-[52px] w-full rounded-2xl bg-brand-500 text-[16px] font-bold text-white disabled:opacity-60">
          {sending ? 'Sending…' : id ? 'Send again for approval' : 'Send for approval'}
        </button>
        <button type="button" onClick={() => setStep('edit')} className="h-[52px] w-full rounded-2xl border-[1.5px] border-neutral-200 text-[16px] font-bold text-neutral-900 dark:border-neutral-700">
          Back to edit
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-4 pt-2 md:max-w-2xl lg:max-w-4xl md:px-8">
      <p className="flex items-center justify-between px-0.5 text-[12.5px] text-neutral-500">
        <span>Step 1 of 2 · Details</span>
        {!id && <span>Draft saved</span>}
      </p>
      {decisionNote && (
        <p className="rounded-2xl bg-status-warn/10 px-3.5 py-2.5 text-[13px] leading-snug text-neutral-900">
          <b>Changes asked:</b> “{decisionNote}”
        </p>
      )}

      <section aria-label="Start date" className={`${card} space-y-3 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15.5px] font-extrabold text-neutral-900">Leave Phnom Penh</p>
          <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-extrabold ${soon ? 'bg-status-danger/10 text-status-danger' : 'bg-status-working/10 text-status-working'}`}>
            {soon ? `Too soon · needs ${rates.noticeHours} h notice` : `${rates.noticeHours} h notice ok`}
          </span>
        </div>
        <label className={`relative flex items-center gap-3 rounded-[14px] border-[1.5px] px-3 py-2.5 ${soon ? 'border-status-danger' : 'border-neutral-300 dark:border-neutral-600'}`}>
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold text-neutral-900">{longDate}</span>
            <span className="block text-[12.5px] text-neutral-500">{leaveIn === 0 ? 'Today' : leaveIn === 1 ? 'Tomorrow' : `In ${leaveIn} days`}</span>
          </span>
          <input
            type="date"
            value={draft.start}
            min={first}
            onChange={(e) => e.target.value && set({ start: e.target.value })}
            aria-label="Trip start date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {quickStarts(first).map((q) => (
            <button key={q} type="button" onClick={() => set({ start: q })} className={`h-[34px] shrink-0 rounded-full border-[1.5px] px-3.5 text-[13px] ${q === draft.start ? 'border-brand-500 bg-brand-500 font-bold text-white' : 'border-neutral-300 font-semibold text-neutral-900 dark:border-neutral-600'}`}>
              {dayLabel(q)}
            </button>
          ))}
        </div>
        {soon && (
          <p role="alert" className="rounded-xl bg-status-danger/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
            You’d leave in {Math.max(hrs, 0)} h. Trips must be sent at least {rates.noticeHours} h before you leave ({rates.leaveAt} on day 1). Earliest start: {dayLabel(first)}.
          </p>
        )}
      </section>

      <section aria-label="Who is going" className={`${card} space-y-3 p-4`}>
        <div className="flex items-center justify-between">
          <p className="text-[15.5px] font-extrabold text-neutral-900">Who’s going</p>
          <span className="text-[12.5px] text-neutral-500">
            {people} {people === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.people.map((uid) => (
            <span key={uid} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 pl-1 pr-3 text-[13px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">
              <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-brand-500 text-[10px] font-extrabold text-white">{initials(fullNameOf(uid))}</span>
              {uid === meId ? `${fullNameOf(uid)} (you)` : nameOf(uid)}
              {uid !== meId && (
                <button type="button" aria-label={`Remove ${nameOf(uid)}`} onClick={() => setPeople(draft.people.filter((p) => p !== uid))} className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full opacity-70">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          <button type="button" onClick={() => setSheet({ kind: 'people' })} className="inline-flex h-8 items-center gap-1 rounded-full border-[1.5px] border-dashed border-neutral-300 px-3 text-[13px] font-bold text-brand-600 dark:border-neutral-600">
            <Plus className="h-4 w-4" aria-hidden /> Add people
          </button>
        </div>
        {clashes.length > 0 && <p className="rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] text-neutral-900">{clashes.map((c) => `${c.name}: ${c.busy}`).join(' · ')}</p>}
      </section>

      <p className={`${sub} px-0.5 pt-1`}>Day by day</p>
      <div className={`${card} px-3.5 py-1`}>
        {plan.days.map((d, i) => {
          const empty = !d.provinces.length
          const warns: string[] = []
          if (holidays[d.date]) warns.push(`Public holiday — ${holidays[d.date]}. Visits are allowed, but many shops will be closed.`)
          if (d.km > LONG_DAY_KM) warns.push(`≈ ${d.km} km of driving. Consider another night on the way, or fewer stops.`)
          if (i < lastI && !d.night && !empty) warns.push('Pick where you sleep, or the trip cannot be sent.')
          const rooms = roomsFor(d, people, rates.perRoom)
          return (
            <div key={i} className={`py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-[13px] font-extrabold text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">{d.n}</span>
                <span className="min-w-0 flex-1 text-[15px] font-extrabold text-neutral-900">{d.label}</span>
                {draft.days.length > 1 && (
                  <button type="button" aria-label={`Remove day ${d.n}`} onClick={() => removeDay(i)} className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1.5 pl-[42px]">
                <div className="flex flex-wrap gap-1.5">
                  {d.provinces.map((c) => (
                    <button key={c} type="button" onClick={() => setSheet({ kind: 'day', i })} aria-label={`Change day ${d.n} provinces`}>
                      <ProvincePill kind="visit" name={provinceName(c)} count={counts[c]?.total} />
                    </button>
                  ))}
                  <button type="button" onClick={() => setSheet({ kind: 'day', i })} className={`inline-flex h-7 items-center gap-1 rounded-full border-[1.5px] border-dashed px-2.5 text-[12.5px] font-bold text-brand-600 ${empty ? 'border-brand-500' : 'border-neutral-300 dark:border-neutral-600'}`}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> {empty ? 'Add provinces to visit' : 'Province'}
                  </button>
                </div>
                {!empty && (
                  <div className="flex flex-wrap gap-1.5">
                    {d.night ? (
                      <button type="button" onClick={() => setSheet({ kind: 'day', i })} aria-label={`Change where you sleep on day ${d.n}`}>
                        <ProvincePill kind="sleep" name={provinceName(d.night)} count={`${rooms} room${rooms === 1 ? '' : 's'}`} />
                      </button>
                    ) : i === lastI ? (
                      <ProvincePill kind="home" name="Phnom Penh" count="home" />
                    ) : (
                      <button type="button" onClick={() => setSheet({ kind: 'day', i })} className="inline-flex h-7 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-status-warn px-2.5 text-[12.5px] font-bold text-status-warn">
                        <Moon className="h-3 w-3" aria-hidden /> Where do you sleep tonight?
                      </button>
                    )}
                  </div>
                )}
                {warns.map((w) => (
                  <p key={w} role="note" className="flex items-start gap-1.5 text-[12.5px] leading-snug text-status-warn">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {w}
                  </p>
                ))}
              </div>
            </div>
          )
        })}
        <button type="button" onClick={addDay} disabled={draft.days.length >= 31} className="mb-2 mt-1 flex h-12 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-neutral-300 text-sm font-bold text-brand-600 disabled:opacity-40 dark:border-neutral-600">
          <Plus className="h-4 w-4" aria-hidden /> Add day
        </button>
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

      <section aria-label="Fuel and transport" className={`${card} space-y-3 p-4`}>
        <div className="flex items-center justify-between">
          <p className="text-[15.5px] font-extrabold text-neutral-900">Fuel / transport</p>
          <span className="text-[12.5px] text-neutral-500">Optional</span>
        </div>
        <MoneyInput optional label="Fuel / transport" value={draft.fuel} max={100000} onChange={(v) => set({ fuel: v })} onValidChange={setFuelOk} />
        <p className="text-[12.5px] leading-snug text-neutral-500">One vehicle for the whole trip. Leave empty if there is none.</p>
      </section>

      <section aria-label="Special allowance" className={`${card} space-y-3 p-4`}>
        <div className="flex items-center justify-between">
          <p className="text-[15.5px] font-extrabold text-neutral-900">Special allowance</p>
          <span className="text-[12.5px] text-neutral-500">{draft.special.length ? `${money(cost.special)} · max ${money(rates.specialCap)}` : `Max ${money(rates.specialCap)}`}</span>
        </div>
        {draft.special.map((s, i) => (
          <div key={i} className={`space-y-2 ${i ? 'border-t border-neutral-100 pt-3 dark:border-neutral-800' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-brand-500 px-3 text-[12.5px] font-bold text-white">{s.reason}</span>
              <span className="flex-1" />
              <MoneyInput
                key={`${specialRev}-${i}`}
                size="sm"
                label={`Amount for ${s.reason}`}
                value={s.amount}
                max={10000}
                onChange={(v) => setSpecial(draft.special.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
                onValidChange={amountValid(i)}
              />
              <button type="button" aria-label={`Remove ${s.reason}`} onClick={() => removeSpecial(i)} className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              value={s.note}
              onChange={(e) => setSpecial(draft.special.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              placeholder="Note for the approver"
              aria-label={`Note for ${s.reason}`}
              className="h-11 w-full rounded-[14px] border-[1.5px] border-neutral-300 bg-transparent px-3.5 text-[14.5px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:border-neutral-600"
            />
          </div>
        ))}
        {!draft.special.length && <p className="text-[12.5px] leading-snug text-neutral-500">Nothing extra. Add costs the standard rates don’t cover, like a ferry, parking or a customer event.</p>}
        <div className="flex flex-wrap gap-1.5">
          {SPECIAL_REASONS.map((r) => (
            <button key={r.reason} type="button" onClick={() => setSpecial([...draft.special, { reason: r.reason, note: '', amount: r.amount }])} className="inline-flex h-8 items-center rounded-full border-[1.5px] border-neutral-300 px-3 text-[13px] font-semibold text-neutral-900 dark:border-neutral-600">
              {r.reason}
            </button>
          ))}
        </div>
        {cost.over && (
          <p role="alert" className="rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
            Special allowance is {money(cost.special)}, over the {money(rates.specialCap)} limit per trip. You can still send it; the approver will see it flagged.
          </p>
        )}
      </section>

      <section aria-label="Purpose" className={`${card} space-y-3 p-4`}>
        <div className="flex items-center justify-between">
          <p className="text-[15.5px] font-extrabold text-neutral-900">What is this trip for?</p>
          <span className="text-[12.5px] text-neutral-500">Optional</span>
        </div>
        <textarea
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          rows={3}
          aria-label="What is this trip for?"
          placeholder="Note for your manager"
          className="w-full rounded-[14px] border-[1.5px] border-neutral-300 bg-transparent px-3.5 py-2.5 text-[14.5px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:border-neutral-600"
        />
      </section>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center gap-3.5 border-t border-neutral-200 bg-neutral-50 px-4 py-3 md:bottom-0 md:-mx-8 md:px-8 dark:border-neutral-800">
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-neutral-500">Total spending</span>
          <span className="block text-[22px] font-extrabold leading-[26px] tabular-nums text-neutral-900">{money(cost.total)}</span>
          <span className={`block truncate text-[12px] ${ok ? 'text-neutral-500' : 'text-status-warn'}`}>{ok ? (people > 1 ? `${money(cost.perPerson)} per person` : 'Just you') : blocker}</span>
        </span>
        <button type="button" disabled={!ok} onClick={() => setStep('review')} className="flex h-[52px] shrink-0 items-center gap-1.5 rounded-2xl bg-brand-500 px-6 text-[16px] font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-500 dark:disabled:bg-neutral-800">
          Review <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

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
