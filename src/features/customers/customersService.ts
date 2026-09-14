import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import type { VisitRow } from '@/features/attendance/types'

export type CustomerDirectoryRow = Tables<'customer_directory'>

export interface NewCustomerInput {
  shopName: string
  businessType?: string | null
  streetAddress?: string | null
  latitude?: number | null
  longitude?: number | null
}

/**
 * Customer browsing/creation for the field-sales Customers module.
 * `customer_directory` (security_invoker view over `customers` +
 * contact/photo/province joins) is what every screen here reads from --
 * RLS on the underlying `customers` table (customer_view, scoped 'any' for
 * the Sales Team role) still applies, so this naturally returns the same
 * shared customer book `nearby_customers` already draws from, not just
 * "my" customers.
 */
export const customersService = {
  async list(): Promise<CustomerDirectoryRow[]> {
    const { data, error } = await supabase.from('customer_directory').select('*').order('shop_name', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async get(customerId: string): Promise<CustomerDirectoryRow | null> {
    const { data, error } = await supabase.from('customer_directory').select('*').eq('id', customerId).maybeSingle()
    if (error) throw error
    return data
  },

  /** That customer's own recent visits (any rep, not just the caller) -- Customer Detail's Recent Activity. */
  async recentVisits(customerId: string, limit = 5): Promise<VisitRow[]> {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('customer_id', customerId)
      .order('checked_in_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  /** Quick-add from the field: just enough to check in against right away -- owner_id is the creator, matching customers_insert's 'own' scope for Sales Team. */
  async quickCreate(userId: string, input: NewCustomerInput): Promise<string> {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        shop_name: input.shopName,
        business_type: input.businessType || null,
        street_address: input.streetAddress || null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        owner_id: userId,
        created_by: userId,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  },
}
