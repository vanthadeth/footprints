import { Link } from 'react-router-dom'
import { LEAVE_TYPE_COLOR, type LeaveBalanceSummary, type LeaveRequest } from './types'
import { leaveRequestDays } from './leaveMath'

interface Props {
  balances: LeaveBalanceSummary[]
  /** The user's own requests -- pending days are shown as a lighter segment, and unpaid (which has no balance row) is summed from approved ones. */
  requests: LeaveRequest[]
  /** Horizontal swipe row (Leave tab) vs a stacked list (Balance tab). */
  layout?: 'row' | 'stack'
  linkTo?: string
  /** Flexible days off left this cycle, for people who earn them (shown between Annual and Sick). */
  flex?: { left: number; allowance: number } | null
}

/** Working days the request uses, as stored when it was made; older rows fall back to a calendar-day count. */
function daysOf(r: LeaveRequest) {
  const stored = r.days
  return stored != null ? Number(stored) : leaveRequestDays(r.start_date, r.end_date, r.start_period, r.end_period)
}

/** Gusto-style balance cards: big "days left", a used/pending bar, and the quota underneath. */
export function BalanceCards({ balances, requests, layout = 'row', linkTo, flex }: Props) {
  const year = String(new Date().getFullYear())
  const pendingDays = (type: 'annual' | 'sick') =>
    requests.filter((r) => r.status === 'pending' && r.leave_type === type && r.start_date.startsWith(year)).reduce((a, r) => a + daysOf(r), 0)
  const unpaidTaken = requests
    .filter((r) => r.status === 'approved' && r.leave_type === 'unpaid' && r.start_date.startsWith(year))
    .reduce((a, r) => a + daysOf(r), 0)

  const cards: { key: string; name: string; big: string; unit: string; usedPct: number; pendingPct: number; caption: string; color: string }[] = (
    ['annual', 'sick'] as const
  ).map((type) => {
    const b = balances.find((x) => x.leave_type === type)
    const quota = b?.quota_days ?? 0
    const used = b?.used_days ?? 0
    const pending = pendingDays(type)
    const left = b?.remaining_days ?? 0
    return {
      key: type,
      name: type === 'annual' ? 'Annual' : 'Sick',
      big: String(left),
      unit: left === 1 ? 'day left' : 'days left',
      usedPct: quota ? Math.min(100, (used / quota) * 100) : 0,
      pendingPct: quota ? Math.min(100, (pending / quota) * 100) : 0,
      caption: quota ? `${used} used${pending ? ` · ${pending} pending` : ''} of ${quota}` : 'No allowance set yet',
      color: LEAVE_TYPE_COLOR[type],
    }
  })
  if (flex) {
    cards.splice(1, 0, {
      key: 'flex',
      name: 'Flexible',
      big: String(flex.left),
      unit: flex.left === 1 ? 'day left' : 'days left',
      usedPct: flex.allowance ? Math.min(100, ((flex.allowance - flex.left) / flex.allowance) * 100) : 0,
      pendingPct: 0,
      caption: `of ${flex.allowance} this cycle`,
      color: LEAVE_TYPE_COLOR.flex,
    })
  }
  cards.push({
    key: 'unpaid',
    name: 'Unpaid',
    big: String(unpaidTaken),
    unit: unpaidTaken === 1 ? 'day taken' : 'days taken',
    usedPct: 0,
    pendingPct: 0,
    caption: 'No yearly limit',
    color: LEAVE_TYPE_COLOR.unpaid,
  })

  // Row layout (Leave tab, as on the canvas): Annual on its own full row, then the rest side by side.
  const wrap = layout === 'row' ? `grid gap-2.5 ${cards.length > 3 ? 'grid-cols-3' : 'grid-cols-2'}` : 'space-y-2.5'
  const item = (key: string) => (layout === 'row' && key === 'annual' ? 'col-span-full' : '')

  return (
    <div className={wrap}>
      {cards.map((c) => {
        const wide = layout === 'stack' || c.key === 'annual'
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-neutral-600">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
            <span className="flex items-baseline gap-1">
              <span className={`${wide ? 'text-[32px]' : 'text-[22px]'} font-extrabold tracking-tight text-neutral-900`}>{c.big}</span>
              <span className={`text-xs font-semibold text-neutral-500 ${wide ? '' : 'hidden'}`}>{c.unit}</span>
            </span>
            <span className="flex h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span style={{ width: `${c.usedPct}%`, backgroundColor: c.color }} />
              <span style={{ width: `${c.pendingPct}%`, backgroundColor: c.color, opacity: 0.4 }} />
            </span>
            <span className={`text-[11.5px] text-neutral-500 ${wide ? '' : 'truncate'}`}>{wide ? c.caption : c.unit}</span>
          </>
        )
        const cls = `${item(c.key)} flex min-w-0 flex-col gap-2 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card`
        return linkTo ? (
          <Link key={c.key} to={linkTo} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={c.key} className={cls}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
