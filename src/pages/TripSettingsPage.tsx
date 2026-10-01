import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Stepper } from '@/components/Stepper'
import { Switch } from '@/components/Switch'
import { DEFAULT_RATES, costOf, money, planTrip, type TripRates } from '@/features/trips/trip'
import { tripErrorMessage, tripService } from '@/features/trips/tripService'
import { card, kicker } from '@/features/trips/tripStyles'

// The worked example: 3 people, 4 days, 3 nights through Takeo, Kampot, Kep, Sihanoukville, Kampong Speu.
const EXAMPLE = planTrip('2026-10-05', [
  { provinces: ['TKO', 'KMP'], night: 'KMP', rooms: null },
  { provinces: ['KEP', 'KMP'], night: 'KMP', rooms: null },
  { provinces: ['KPS'], night: 'KPS', rooms: null },
  { provinces: ['KSP'], night: null, rooms: null },
])

function Row({ label, sub, children, top = true }: { label: string; sub: string; children: React.ReactNode; top?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${top ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">{label}</span>
        <span className="block text-[12.5px] leading-snug text-neutral-500">{sub}</span>
      </span>
      {children}
    </div>
  )
}

/**
 * Sales trip settings (System Admin): the standard rates every request is
 * costed with, people per room, the special allowance limit, notice, and
 * clock-in on trip days. Who can request and approve lives in Permissions.
 */
export function TripSettingsPage() {
  const [r, setR] = useState<TripRates | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    tripService
      .rates()
      .then(setR)
      .catch((e) => {
        setR(DEFAULT_RATES)
        setMsg({ ok: false, text: tripErrorMessage(e) })
      })
  }, [])

  const example = useMemo(() => (r ? costOf(EXAMPLE, r, 3, []) : null), [r])
  if (!r || !example) return <div className="mx-auto mt-4 h-64 max-w-lg animate-pulse rounded-2xl bg-neutral-100" />
  const set = (patch: Partial<TripRates>) => {
    setR({ ...r, ...patch })
    setMsg(null)
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await tripService.saveRates(r)
      setMsg({ ok: true, text: 'Saved. New trip requests use these rates; trips already sent keep theirs.' })
    } catch (e) {
      setMsg({ ok: false, text: tripErrorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      <p className="px-1 text-[13px] leading-snug text-neutral-500">Every trip request is costed with these standard rates. Changes apply to trips sent from now on — trips already sent keep their rates.</p>

      <div className={`${card} px-3.5`}>
        <p className={`${kicker} pt-3`}>Standard rates</p>
        <Row label="Daily allowance" sub="Per person, every trip day" top={false}>
          <Stepper label="Daily allowance" value={r.dayRate} step={1} min={0} max={500} format={money} onChange={(v) => set({ dayRate: v })} />
        </Row>
        <Row label="Hotel" sub="Per room, each night away">
          <Stepper label="Hotel rate" value={r.nightRate} step={1} min={0} max={1000} format={money} onChange={(v) => set({ nightRate: v })} />
        </Row>
        <Row label="Fuel / transport" sub="Per km of the planned route, once per trip">
          <Stepper label="Fuel rate" value={Math.round(r.kmRate * 100)} step={1} min={0} max={500} format={(v) => money(v / 100)} onChange={(v) => set({ kmRate: v / 100 })} />
        </Row>
        <Row label="People per room" sub="Sets the default rooms a night; requests can change any night">
          <Stepper label="People per room" value={r.perRoom} min={1} max={6} onChange={(v) => set({ perRoom: v })} />
        </Row>
      </div>

      <div className="rounded-2xl bg-earth-50 p-3.5 dark:bg-amber-900/25">
        <p className="text-[12px] font-extrabold uppercase tracking-wide text-earth-500 dark:text-amber-200">Example · 3 people, 4 days, 3 nights, ≈ {EXAMPLE.totalKm} km</p>
        <p className="mt-1.5 text-[24px] font-extrabold tabular-nums text-neutral-900">
          {money(example.total)} <span className="text-[14px] font-bold text-neutral-600">· {money(example.perPerson)} per person</span>
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-neutral-600">{example.lines.map((l) => `${l.label} ${l.calc} = ${money(l.value)}`).join(' · ')}</p>
      </div>

      <div className={`${card} px-3.5`}>
        <p className={`${kicker} pt-3`}>Special allowance</p>
        <Row label="Limit per trip" sub="Over it, the request is flagged to the approver" top={false}>
          <Stepper label="Special allowance limit" value={r.specialCap} step={10} min={0} max={5000} format={money} onChange={(v) => set({ specialCap: v })} />
        </Row>
        <Row label="Reason required" sub="Ferry / boat, Parking & tolls, Customer event, Loading help, Other">
          <Switch label="Reason required" checked={r.reasonRequired} onChange={(v) => set({ reasonRequired: v })} />
        </Row>
      </div>

      <div className={`${card} px-3.5`}>
        <p className={`${kicker} pt-3`}>Requests</p>
        <Row label="Send before leaving" sub={`Trips leave at ${r.leaveAt} on day 1`} top={false}>
          <Stepper label="Notice hours" value={r.noticeHours} step={12} min={0} max={168} format={(v) => `${v} h`} onChange={(v) => set({ noticeHours: v })} />
        </Row>
        <Row label="Clock in anywhere on trip days" sub="On approved trip days only. Work locations still apply on other days.">
          <Switch label="Clock in anywhere on trip days" checked={r.clockAnywhere} onChange={(v) => set({ clockAnywhere: v })} />
        </Row>
        <Link to="/settings/permissions" className="flex items-center gap-3 border-t border-neutral-100 py-3 dark:border-neutral-800">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-neutral-900">Who can request and approve</span>
            <span className="block text-[12.5px] text-neutral-500">Request: Salesperson (Province), Remote Salesperson · Approve: Sale Manager, Super Admin · in Permissions</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>
      </div>

      {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? 'bg-status-working/10 text-status-working dark:text-emerald-300' : 'bg-status-danger/10 text-status-danger'}`}>{msg.text}</p>}
      <button type="button" disabled={saving} onClick={save} className="h-[50px] w-full rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white disabled:opacity-60">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
