import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type VisitOptionKind = Tables<'visit_options'>['kind']
export type VisitOption = Tables<'visit_options'>

export const visitOptionsService = {
  /** All active options across every kind, in display order -- the small, fixed lookup table set up alongside visit_type_id/visit_status_id/order_status_id/payment_status_id on `visits`. */
  async listActive(): Promise<VisitOption[]> {
    const { data, error } = await supabase.from('visit_options').select('*').eq('active', true).order('kind').order('sort_order')
    if (error) throw error
    return data ?? []
  },
}
