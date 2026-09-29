import { callRpc } from '@/lib/rpc'

export type Bucket = '0-14' | '15-30' | '31-60' | '60+' | 'never'
export type BookSort = 'last' | 'name' | 'owner' | 'visits' | 'freq' | 'next' | 'distance'

/** One row of customer_book. Declared by hand: the generated RPC types mark every column non-null. */
export interface BookRow {
  customer_id: string
  shop_name: string
  code: string | null
  district: string | null
  province_code: string
  province_name: string
  owner_id: string | null
  owner_name: string | null
  owner_nickname: string | null
  last_visit_at: string | null
  days_since: number | null
  last_by_id: string | null
  last_by_name: string | null
  last_by_nickname: string | null
  visits_90: number
  freq_days: number | null
  last_visit_status: string | null
  last_order_status: string | null
  last_amount: number | null
  last_payment: string | null
  last_collected: number | null
  next_visit: string | null
  bucket: Bucket
  distance_m: number | null
  total_count: number
}

export interface SummaryRow {
  province_code: string
  province_name: string
  bucket: Bucket
  n: number
}

export interface ActivityRow {
  visit_id: string
  checked_in_at: string
  user_id: string
  full_name: string | null
  nickname: string | null
  visit_status: string | null
  order_status: string | null
  payment_status: string | null
  order_amount: number | null
  collected: number | null
  remarks: string | null
  next_visit: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

export interface Visitor {
  user_id: string
  full_name: string
  nickname: string | null
  visits: number
}

/** The filters every book call shares (search, owner, and the "visited by" section). */
export interface BookScope {
  search?: string
  owner?: string | null
  people?: string[]
  mode?: 'visited' | 'not'
  months?: number
}

export interface BookQuery extends BookScope {
  province?: string | null
  ranges?: Bucket[]
  sort?: BookSort
  desc?: boolean | null
  lat?: number | null
  lng?: number | null
  limit?: number
  offset?: number
}

function scopeArgs(s: BookScope): Record<string, unknown> {
  return {
    p_search: s.search?.trim() || null,
    p_owner: s.owner || null,
    p_people: s.people?.length ? s.people : null,
    p_mode: s.mode ?? 'visited',
    p_months: s.months ?? 3,
  }
}

/**
 * The customer book (0095): counts, pages and visit history computed in the
 * database from every rep's visits, so the app never has to load all
 * customers or the visits RLS would hide from Sales.
 */
export const customerBookService = {
  summary(scope: BookScope): Promise<SummaryRow[]> {
    return callRpc<SummaryRow[]>('customer_book_summary', scopeArgs(scope)).then((r) => r ?? [])
  },

  page(q: BookQuery): Promise<BookRow[]> {
    return callRpc<BookRow[]>('customer_book', {
      ...scopeArgs(q),
      p_province: q.province ?? null,
      p_ranges: q.ranges?.length ? q.ranges : null,
      p_sort: q.sort ?? 'last',
      p_desc: q.desc ?? null,
      p_lat: q.lat ?? null,
      p_lng: q.lng ?? null,
      p_limit: q.limit ?? 20,
      p_offset: q.offset ?? 0,
    }).then((r) => r ?? [])
  },

  activity(customerId: string): Promise<ActivityRow[]> {
    return callRpc<ActivityRow[]>('customer_visit_activity', { p_customer: customerId }).then((r) => r ?? [])
  },

  visitors(months = 12): Promise<Visitor[]> {
    return callRpc<Visitor[]>('customer_visitors', { p_months: months }).then((r) => r ?? [])
  },
}
