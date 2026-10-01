import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/rpc'
import { DEFAULT_RATES, type BusyDay, type SpecialLine, type TripDayInput, type TripRates } from './trip'

export type TripStatus = 'pending' | 'approved' | 'changes' | 'rejected' | 'cancelled'

export interface TripPerson {
  user_id: string
  name: string
  full_name: string
  role: string | null
}

export interface TripDayRow {
  day_no: number
  day: string
  provinces: string[]
  night: string | null
  rooms: number | null
  km: number
}

/** One trip from sales_trips() (0103). */
export interface TripRow {
  id: string
  user_id: string
  requester: string
  requester_role: string | null
  status: TripStatus
  start_date: string
  end_date: string
  note: string | null
  total_km: number
  day_rate: number
  night_rate: number
  km_rate: number
  people_count: number
  room_nights: number
  special_total: number
  est_total: number
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  can_decide: boolean
  days: TripDayRow[]
  people: TripPerson[]
  specials: { reason: string; note: string | null; amount: number }[]
}

export interface TripCandidate {
  user_id: string
  name: string
  full_name: string
  role: string | null
  field_sales: boolean
  busy: BusyDay[]
}

export interface TripDraft {
  start: string
  days: TripDayInput[]
  people: string[]
  special: SpecialLine[]
  note: string
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))

function normalize(t: TripRow): TripRow {
  return {
    ...t,
    total_km: num(t.total_km),
    day_rate: num(t.day_rate),
    night_rate: num(t.night_rate),
    km_rate: num(t.km_rate),
    special_total: num(t.special_total),
    est_total: num(t.est_total),
    specials: (t.specials ?? []).map((s) => ({ ...s, amount: num(s.amount) })),
    days: t.days ?? [],
    people: t.people ?? [],
  }
}

/** Trip days as the editor uses them. */
export function toDays(t: TripRow): TripDayInput[] {
  return t.days.map((d) => ({ provinces: d.provinces, night: d.night, rooms: d.night ? d.rooms : null }))
}

/** A trip as the rates it was sent with -- the estimate never moves when settings change later. */
export function tripRates(t: TripRow, current: TripRates = DEFAULT_RATES): TripRates {
  return { ...current, dayRate: t.day_rate, nightRate: t.night_rate, kmRate: t.km_rate }
}

export const tripService = {
  /** Trips I sent or am on, newest first. */
  async mine(): Promise<TripRow[]> {
    return ((await callRpc<TripRow[]>('sales_trips', { p_mode: 'mine' })) ?? []).map(normalize)
  },

  /** Trips I can view as an approver (mine excluded). */
  async team(): Promise<TripRow[]> {
    return ((await callRpc<TripRow[]>('sales_trips', { p_mode: 'team' })) ?? []).map(normalize)
  },

  /** Send a new trip, or re-send one of mine (pending or changes asked). km per day comes from the editor's estimate. */
  async request(draft: TripDraft, kmPerDay: number[], tripId: string | null = null): Promise<{ id: string }> {
    return callRpc<{ id: string }>('request_sales_trip', {
      p_trip_id: tripId,
      p_start: draft.start,
      p_days: draft.days.map((d, i) => ({ provinces: d.provinces, night: d.night, rooms: d.night ? d.rooms : null, km: kmPerDay[i] ?? 0 })),
      p_people: draft.people,
      p_special: draft.special.map((s) => ({ reason: s.reason, note: s.note, amount: s.amount })),
      p_note: draft.note || null,
    })
  },

  async decide(id: string, decision: 'approved' | 'rejected' | 'changes', note?: string): Promise<void> {
    await callRpc('decide_sales_trip', { p_id: id, p_decision: decision, p_note: note?.trim() || null })
  },

  async cancel(id: string): Promise<void> {
    await callRpc('cancel_sales_trip', { p_id: id })
  },

  /** People who can join, field sales first, with leave / other trips between from and to. */
  async candidates(from: string, to: string, tripId: string | null = null): Promise<TripCandidate[]> {
    return (await callRpc<TripCandidate[]>('sales_trip_candidates', { p_from: from, p_to: to, p_trip: tripId })) ?? []
  },

  async rates(): Promise<TripRates> {
    const { data, error } = await supabase
      .from('app_settings')
      .select(
        'trip_day_rate, trip_night_rate, trip_km_rate, trip_people_per_room, trip_special_cap, trip_special_reason_required, trip_notice_hours, trip_leave_time, trip_clock_anywhere'
      )
      .single()
    if (error) throw error
    return {
      dayRate: num(data.trip_day_rate),
      nightRate: num(data.trip_night_rate),
      kmRate: num(data.trip_km_rate),
      perRoom: data.trip_people_per_room,
      specialCap: num(data.trip_special_cap),
      reasonRequired: data.trip_special_reason_required,
      noticeHours: data.trip_notice_hours,
      leaveAt: String(data.trip_leave_time).slice(0, 5),
      clockAnywhere: data.trip_clock_anywhere,
    }
  },

  /** Writes the trip settings; RLS (settings:edit) is the gate. */
  async saveRates(r: TripRates): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .update({
        trip_day_rate: r.dayRate,
        trip_night_rate: r.nightRate,
        trip_km_rate: r.kmRate,
        trip_people_per_room: r.perRoom,
        trip_special_cap: r.specialCap,
        trip_special_reason_required: r.reasonRequired,
        trip_notice_hours: r.noticeHours,
        trip_leave_time: r.leaveAt,
        trip_clock_anywhere: r.clockAnywhere,
      })
      .eq('id', true)
    if (error) throw error
  },
}

/** The friendly text from a raised RPC exception (details first). */
export function tripErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { details?: string; message?: string }
    if (e.details) return e.details
    if (e.message) return e.message
  }
  return 'Something went wrong.'
}

const DRAFT_KEY = 'footprints.tripDraft'

/** The unsent trip, kept on this device. */
export const tripDraftStore = {
  load(): TripDraft | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      return raw ? (JSON.parse(raw) as TripDraft) : null
    } catch {
      return null
    }
  },
  save(d: TripDraft): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      // Private mode / storage full: the draft just isn't kept.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      // ignore
    }
  },
}
