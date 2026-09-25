import { supabase } from '@/lib/supabase'

/** One row of my_plan. Declared by hand: the generated RPC types mark every column non-null, but these can be null. */
export interface PlanItem {
  item_id: string
  customer_id: string
  shop_name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  tier: string
  sort_order: number
  source: string
  status: string
  visit_id: string | null
  checked_in_at: string | null
  checked_out_at: string | null
  appointment_at: string | null
  last_visit_at: string | null
}
export type PlanItemStatus = 'planned' | 'done' | 'skipped'
export type PlanItemSource = 'manual' | 'appointment' | 'suggested'

/**
 * Today's plan (0088). my_plan also does the bookkeeping: it pulls in the
 * day's next-appointment visits and ticks off stops you've already
 * checked in at, so a plain refetch after a visit is all the UI needs.
 */
export const planService = {
  async list(date: string): Promise<PlanItem[]> {
    const { data, error } = await supabase.rpc('my_plan', { p_date: date })
    if (error) throw error
    return (data ?? []) as PlanItem[]
  },

  async add(date: string, customerId: string, source: 'manual' | 'suggested' = 'manual'): Promise<void> {
    const { error } = await supabase.rpc('plan_add', { p_date: date, p_customer: customerId, p_source: source })
    if (error) throw error
  },

  async remove(itemId: string): Promise<void> {
    const { error } = await supabase.rpc('plan_remove', { p_item: itemId })
    if (error) throw error
  },

  async setSkipped(itemId: string, skipped: boolean): Promise<void> {
    const { error } = await supabase.rpc('plan_skip', { p_item: itemId, p_skipped: skipped })
    if (error) throw error
  },

  async reorder(date: string, itemIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('plan_reorder', { p_date: date, p_ids: itemIds })
    if (error) throw error
  },
}
