import { callRpc } from '@/lib/rpc'
import type { FlexCycle, FlexDay, FlexKind } from './flex'

type N = number | string | null
const num = (v: N) => Number(v ?? 0)

type CycleRow = {
  cycle_start: string
  cycle_end: string
  close_day: number
  is_flexible: boolean
  saturdays: number
  sundays: number
  sat_rate: N
  sun_rate: N
  allowance: N
  requested: N
  auto_days: N
  taken: N
  planned: N
  left_days: N
  closed: boolean
  settled: boolean
  settled_at: string | null
  unused_days: N
  over_days: N
  annual_days: N
  unpaid_days: N
}

export type DayOffMode = 'company' | 'flexible'

export interface DayOffModeInfo {
  mode: DayOffMode
  nextMode: DayOffMode | null
  nextFrom: string | null
  cycleStart: string
  nextCycleStart: string
}

export interface FlexSettings {
  closeDay: number
  satRate: number
  sunRate: number
  flexiblePeople: number
}

/** Flexible days off (0100): cycles, their days, each person's rule and the company rates. */
export const flexService = {
  async cycle(userId: string | null = null, date: string | null = null): Promise<FlexCycle | null> {
    const rows = await callRpc<CycleRow[]>('flex_cycle', { p_user: userId, p_date: date })
    const r = rows?.[0]
    if (!r) return null
    return {
      cycleStart: r.cycle_start,
      cycleEnd: r.cycle_end,
      closeDay: r.close_day,
      isFlexible: r.is_flexible,
      saturdays: r.saturdays,
      sundays: r.sundays,
      satRate: num(r.sat_rate),
      sunRate: num(r.sun_rate),
      allowance: num(r.allowance),
      requested: num(r.requested),
      autoDays: num(r.auto_days),
      taken: num(r.taken),
      planned: num(r.planned),
      left: num(r.left_days),
      closed: r.closed,
      settled: r.settled,
      settledAt: r.settled_at,
      unusedDays: num(r.unused_days),
      overDays: num(r.over_days),
      annualDays: r.annual_days == null ? null : num(r.annual_days),
      unpaidDays: r.unpaid_days == null ? null : num(r.unpaid_days),
    }
  },

  async days(userId: string | null, from: string, to: string): Promise<FlexDay[]> {
    const rows = await callRpc<{ day: string; kind: FlexKind; cost: N; weekday: number; request_id: string | null; holiday_name: string | null }[]>('flex_days', { p_user: userId, p_from: from, p_to: to })
    return (rows ?? []).map((r) => ({ day: r.day, kind: r.kind, cost: num(r.cost), weekday: r.weekday, requestId: r.request_id, holidayName: r.holiday_name }))
  },

  async modeInfo(userId: string | null = null): Promise<DayOffModeInfo | null> {
    const rows = await callRpc<{ mode: DayOffMode; next_mode: DayOffMode | null; next_from: string | null; cycle_start: string; next_cycle_start: string }[]>('day_off_mode_info', { p_user: userId })
    const r = rows?.[0]
    return r ? { mode: r.mode, nextMode: r.next_mode, nextFrom: r.next_from, cycleStart: r.cycle_start, nextCycleStart: r.next_cycle_start } : null
  },

  /** Returns the date the change takes effect, or null if nothing changed. */
  setMode(userId: string, mode: DayOffMode, thisCycle: boolean): Promise<string | null> {
    return callRpc<string | null>('set_day_off_mode', { p_user: userId, p_mode: mode, p_this_cycle: thisCycle })
  },

  async settings(): Promise<FlexSettings> {
    const rows = await callRpc<{ close_day: number; sat_rate: N; sun_rate: N; flexible_people: number }[]>('flex_settings')
    const r = rows?.[0]
    return { closeDay: r?.close_day ?? 20, satRate: num(r?.sat_rate ?? 0.5), sunRate: num(r?.sun_rate ?? 1), flexiblePeople: r?.flexible_people ?? 0 }
  },

  async setRates(sat: number, sun: number): Promise<void> {
    await callRpc<null>('set_flex_rates', { p_sat: sat, p_sun: sun })
  },
}
