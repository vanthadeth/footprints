import { supabase } from '@footprints/shared/lib/supabase'

/** The caller's open (checked in, not out, not cancelled) visit at a customer, if any -- the visit a survey can be attached to. */
export async function findOpenVisit(userId: string, customerId: string): Promise<{ id: string; checked_in_at: string } | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, checked_in_at')
    .eq('user_id', userId)
    .eq('customer_id', customerId)
    .is('checked_out_at', null)
    .is('cancelled_at', null)
    .order('checked_in_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}
