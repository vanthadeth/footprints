import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type WorkLocationRow = Tables<'work_locations'>

export interface LocationInput {
  name: string
  latitude: number
  longitude: number
  radiusM: number
  active: boolean
}

/**
 * Plain CRUD against `work_locations` -- RLS already gates writes to
 * whoever has the settings:edit permission (System Admin), the same
 * shape as visit_options, so no RPC wrapper is needed here (unlike e.g.
 * customer/visit writes, which go through app.<fn> RPCs for business
 * rules this table doesn't have).
 */
export const locationsService = {
  async list(): Promise<WorkLocationRow[]> {
    const { data, error } = await supabase.from('work_locations').select('*').order('name', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async create(userId: string, input: LocationInput): Promise<WorkLocationRow> {
    const { data, error } = await supabase
      .from('work_locations')
      .insert({
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radiusM,
        active: input.active,
        created_by: userId,
      })
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, input: LocationInput): Promise<WorkLocationRow> {
    const { data, error } = await supabase
      .from('work_locations')
      .update({
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radiusM,
        active: input.active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data
  },
}
