import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type CustomerDirectoryRow = Tables<'customer_directory'>

/**
 * Customer browsing for the field-sales Customers module.
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
}
