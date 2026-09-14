import { supabase } from '@/lib/supabase'

export interface MyQuota {
  dailyVisitTarget: number | null
  weeklyVisitTarget: number | null
}

/** Read-only: a user can always see their own quota row (user_visit_quotas_select's RLS), set by a supervisor/admin elsewhere -- nothing here writes it. */
export const quotasService = {
  async getMine(userId: string): Promise<MyQuota> {
    const { data, error } = await supabase
      .from('user_visit_quotas')
      .select('daily_visit_target, weekly_visit_target')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return {
      dailyVisitTarget: data?.daily_visit_target ?? null,
      weeklyVisitTarget: data?.weekly_visit_target ?? null,
    }
  },
}
