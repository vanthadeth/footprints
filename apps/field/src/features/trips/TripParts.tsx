import type { ReactNode } from 'react'
import { Home, Moon } from 'lucide-react'
import { AVATAR_TONES, initials, money, provinceName, roomSplit, roomsFor, strip, type TripCost, type TripPlan } from './trip'
import type { TripStatus } from './tripService'
import { STATUS, card, kicker } from './tripStyles'

export function StatusPill({ status }: { status: TripStatus }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${STATUS[status].tone}`}>{STATUS[status].label}</span>
}

export function Avatar({ name, i, size = 'h-8 w-8 text-[11px]', ring = false }: { name: string; i: number; size?: string; ring?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${size} ${AVATAR_TONES[i % AVATAR_TONES.length]} ${ring ? 'ring-2 ring-white dark:ring-neutral-900' : ''}`}>
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ names }: { names: string[] }) {
  return (
    <span className="flex shrink-0">
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className={i ? '-ml-2' : ''}>
          <Avatar name={n} i={i} ring />
        </span>
      ))}
    </span>
  )
}

/** Phnom Penh → Takeo → ☾ Kampot → … → Phnom Penh, as chips. `dark` for the hero card. */
export function RouteStrip({ plan, dark = false }: { plan: TripPlan; dark?: boolean }) {
  const stops = strip(plan)
  const tone = (k: string) =>
    dark
      ? k === 'home'
        ? 'bg-white/15 text-white'
        : k === 'night'
          ? 'bg-[#FF9F2D]/20 text-[#FFB257]'
          : 'bg-violet-300/25 text-white'
      : k === 'home'
        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'
        : k === 'night'
          ? 'bg-earth-50 text-earth-500'
          : 'bg-status-visiting/10 text-status-visiting'
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {stops.map((s, i) => (
        <span key={`${s.code}-${i}`} className="inline-flex items-center">
          <span className={`inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-extrabold ${tone(s.kind)}`}>
            {s.kind === 'night' && <Moon className="h-3 w-3" aria-hidden />}
            {s.kind === 'home' && <Home className="h-3 w-3" aria-hidden />}
            {s.label}
          </span>
          {i < stops.length - 1 && <span className={`h-0.5 w-3 ${dark ? 'bg-white/30' : 'bg-neutral-200 dark:bg-neutral-700'}`} />}
        </span>
      ))}
    </div>
  )
}

/** Day by day: visits in order, then the overnight (with rooms) or back to Phnom Penh. */
export function DayList({ plan, people, perRoom }: { plan: TripPlan; people: number; perRoom: number }) {
  return (
    <div className={`${card} px-3.5 py-1`}>
      {plan.days.map((d, i) => {
        const rooms = roomsFor(d, people, perRoom)
        return (
          <div key={d.n} className={`flex gap-3 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="w-14 shrink-0">
              <span className="block text-[12px] font-extrabold text-status-visiting">Day {d.n}</span>
              <span className="block text-[12px] text-neutral-500">{d.label.slice(4)}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-neutral-900">{d.provinces.map(provinceName).join(' → ')}</span>
              <span className={`mt-0.5 block text-[12.5px] ${d.back ? 'text-brand-600' : 'text-neutral-600'}`}>
                {d.back ? 'Back to Phnom Penh' : `Overnight in ${provinceName(d.night!)} · ${rooms} room${rooms === 1 ? '' : 's'}`}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-neutral-500">≈ {d.km} km</span>
          </div>
        )
      })}
    </div>
  )
}

/** Each night: where, rooms, and how people share. */
export function RoomsCard({ plan, people, perRoom, roomNights }: { plan: TripPlan; people: number; perRoom: number; roomNights: number }) {
  const nights = plan.days.filter((d) => d.night)
  if (!nights.length) return null
  return (
    <div className={`${card} px-3.5 pb-1 pt-2.5`}>
      <div className="flex items-baseline justify-between pb-1">
        <p className={kicker}>Hotel rooms</p>
        <span className="text-[13px] font-extrabold text-neutral-900">{roomNights} room-night{roomNights === 1 ? '' : 's'}</span>
      </div>
      {nights.map((d) => {
        const rooms = roomsFor(d, people, perRoom)
        const split = roomSplit(people, rooms)
        return (
          <div key={d.n} className="flex items-center gap-3 border-t border-neutral-100 py-2.5 dark:border-neutral-800">
            <span className="w-16 shrink-0 text-[12px] font-bold text-neutral-500">{d.label}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-neutral-900">☾ {provinceName(d.night!)}</span>
              <span className="block text-[12px] text-neutral-500">
                {people === 1 ? 'Just you' : rooms === 1 ? `All ${people} share` : split.map((x) => (x === 1 ? '1 single' : `${x} sharing`)).join(' · ')}
              </span>
            </span>
            <span className="rounded-full bg-earth-50 px-2.5 py-0.5 text-[12px] font-extrabold text-earth-500">
              {rooms} room{rooms === 1 ? '' : 's'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** The estimate: lines, special items, the over-limit flag, total and per person. */
export function CostCard({ cost, people, special, cap, title = 'Estimated cost · standard rates', children }: {
  cost: TripCost
  people: number
  special: { reason: string; note: string | null; amount: number }[]
  cap: number
  title?: string
  children?: ReactNode
}) {
  return (
    <div className={`${card} p-3.5`}>
      <p className={kicker}>{title}</p>
      {cost.lines.map((l) => (
        <p key={l.label} className="mt-2 flex items-baseline gap-2 text-[13.5px] text-neutral-900">
          <span className="font-bold">{l.label}</span>
          <span className="min-w-0 flex-1 text-[12.5px] text-neutral-500">{l.calc}</span>
          <span className="font-extrabold tabular-nums">{money(l.value)}</span>
        </p>
      ))}
      {special.map((s, i) => (
        <p key={i} className="ml-3 mt-1 flex gap-2 text-[12.5px] text-neutral-600">
          <span className="min-w-0 flex-1">
            · {s.reason}
            {s.note ? ` — ${s.note}` : ''}
          </span>
          <span className="font-bold tabular-nums">{money(s.amount)}</span>
        </p>
      ))}
      {cost.over && (
        <p role="note" className="mt-2 rounded-xl bg-status-warn/10 px-2.5 py-2 text-[12.5px] leading-snug text-neutral-900">
          Special allowance {money(cost.special)} is over the {money(cap)} limit per trip — it will be flagged to the approver.
        </p>
      )}
      <p className="mt-2.5 flex justify-between border-t border-neutral-100 pt-2.5 text-[15px] font-extrabold text-neutral-900 dark:border-neutral-800">
        <span>Total</span>
        <span className="tabular-nums">{money(cost.total)}</span>
      </p>
      {people > 1 && <p className="mt-0.5 text-right text-[12.5px] text-neutral-500">{money(cost.perPerson)} per person</p>}
      {children}
    </div>
  )
}

/** ✓ / ! lines. */
export function Checks({ items }: { items: { ok: boolean; text: string }[] }) {
  return (
    <div className={`${card} space-y-2 p-3.5`}>
      <p className={kicker}>Checks</p>
      {items.map((c, i) => (
        <p key={i} className="flex items-start gap-2 text-[13.5px] leading-snug text-neutral-900">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
              c.ok ? 'bg-status-working/10 text-status-working' : 'bg-status-warn/10 text-status-warn'
            }`}
          >
            {c.ok ? '✓' : '!'}
          </span>
          <span>{c.text}</span>
        </p>
      ))}
    </div>
  )
}
