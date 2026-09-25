import { supabase } from '@/lib/supabase'

export type DueState = 'overdue' | 'due' | 'never' | 'ok'

/** One row of customer_coverage. Declared by hand: the generated RPC types mark every column non-null, but these can be null. */
export interface CoverageRow {
  customer_id: string
  shop_name: string
  code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  tier: string
  cadence_days: number
  last_visit_at: string | null
  days_since: number | null
  due_state: DueState
  distance_m: number | null
  visited_by_me: boolean
}
export type CoverageScope = 'mine' | 'nearby' | 'all'
export type Tier = 'A' | 'B' | 'C'

/** Customer tiers + coverage (0087). "Last visit" counts anyone's visit, not just yours. */
export const coverageService = {
  async list(opts: { scope: CoverageScope; lat?: number | null; lng?: number | null; search?: string; limit?: number }): Promise<CoverageRow[]> {
    const { data, error } = await supabase.rpc('customer_coverage', {
      p_scope: opts.scope,
      p_lat: opts.lat ?? undefined,
      p_lng: opts.lng ?? undefined,
      p_search: opts.search?.trim() || undefined,
      p_limit: opts.limit ?? undefined,
    })
    if (error) throw error
    return (data ?? []) as CoverageRow[]
  },

  /** The stored tier, or null when the customer has none (which means B). */
  async getTier(customerId: string): Promise<Tier | null> {
    const { data, error } = await supabase.from('customer_tiers').select('tier').eq('customer_id', customerId).maybeSingle()
    if (error) throw error
    return (data?.tier as Tier | undefined) ?? null
  },

  async setTier(customerId: string, tier: Tier): Promise<void> {
    const { error } = await supabase.rpc('set_customer_tier', { p_customer: customerId, p_tier: tier })
    if (error) throw error
  },
}
