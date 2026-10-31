import { leaveRequestDays } from './leaveMath'
import type { LeaveRequest, LeaveType } from './types'

/** A closed flexible-days-off cycle the minimum rule settled (flex_settlements), as far as the ledger needs. */
export interface FlexSettlementRow {
  cycleStart: string
  cycleEnd: string
  minDays: number | null
  workedDays: number | null
  creditedDays: number | null
  annualDays: number
  unpaidDays: number
}

export type LedgerEntry =
  | { kind: 'leave'; id: string; date: string; endDate: string; type: LeaveType; days: number; status: LeaveRequest['status']; half: boolean }
  | { kind: 'short'; id: string; date: string; cycleStart: string; cycleEnd: string; have: number; min: number; annual: number; unpaid: number }

export interface LedgerMonth {
  /** "YYYY-MM" */
  key: string
  month: number
  entries: LedgerEntry[]
}

const daysOf = (r: LeaveRequest) => (r.days != null ? Number(r.days) : leaveRequestDays(r.start_date, r.end_date, r.start_period, r.end_period))

/**
 * The year's leave history, newest month first: the person's own requests
 * (cancelled ones left out) and the working-days shortfalls the settlement
 * took from their leave. Rows of cycles settled before the minimum rule have
 * no minimum and are not shown.
 */
export function buildLedger(year: number, requests: LeaveRequest[], settlements: FlexSettlementRow[]): LedgerMonth[] {
  const prefix = String(year)
  const entries: LedgerEntry[] = []
  for (const r of requests) {
    if (!r.start_date.startsWith(prefix) || r.status === 'cancelled') continue
    entries.push({
      kind: 'leave',
      id: r.id,
      date: r.start_date,
      endDate: r.end_date,
      type: r.leave_type,
      days: daysOf(r),
      status: r.status,
      half: r.start_period !== 'full' || r.end_period !== 'full',
    })
  }
  for (const s of settlements) {
    if (s.minDays == null || !s.cycleEnd.startsWith(prefix) || s.annualDays + s.unpaidDays <= 0) continue
    entries.push({ kind: 'short', id: `s-${s.cycleEnd}`, date: s.cycleEnd, cycleStart: s.cycleStart, cycleEnd: s.cycleEnd, have: (s.workedDays ?? 0) + (s.creditedDays ?? 0), min: s.minDays, annual: s.annualDays, unpaid: s.unpaidDays })
  }
  const groups = new Map<string, LedgerEntry[]>()
  for (const e of entries) groups.set(e.date.slice(0, 7), [...(groups.get(e.date.slice(0, 7)) ?? []), e])
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({ key, month: Number(key.slice(5, 7)), entries: list.sort((a, b) => b.date.localeCompare(a.date)) }))
}

/** Days of annual leave the year's settlements took (they are already in the balance's "used"). */
export const shortfallAnnual = (settlements: FlexSettlementRow[], year: number) =>
  settlements.filter((s) => s.minDays != null && s.cycleEnd.startsWith(String(year))).reduce((a, s) => a + s.annualDays, 0)

/** What leave the entry took off its balance: approved leave of that type, or the shortfall's annual days. Pending, rejected: nothing. */
export function ledgerDelta(e: LedgerEntry): { annual: number; unpaid: number; sick: number } {
  if (e.kind === 'short') return { annual: e.annual, unpaid: e.unpaid, sick: 0 }
  if (e.status !== 'approved') return { annual: 0, unpaid: 0, sick: 0 }
  return { annual: e.type === 'annual' ? e.days : 0, unpaid: e.type === 'unpaid' ? e.days : 0, sick: e.type === 'sick' ? e.days : 0 }
}
