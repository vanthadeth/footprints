import { supabase } from '@/lib/supabase'
import type { Language } from '@/lib/language'
import type { Tables } from '@/types/database.types'

export type TranslationOverrideRow = Tables<'translation_overrides'>

/**
 * Plain CRUD against `translation_overrides` -- RLS already gates writes
 * to whoever has the settings:edit permission (System Admin), same shape
 * as `locationsService`, so no RPC wrapper is needed.
 */
export const translationOverridesService = {
  async list(): Promise<TranslationOverrideRow[]> {
    const { data, error } = await supabase.from('translation_overrides').select('*')
    if (error) throw error
    return data ?? []
  },

  async upsert(key: string, language: Language, value: string, updatedBy: string): Promise<void> {
    const { error } = await supabase
      .from('translation_overrides')
      .upsert({ key, language, value, updated_by: updatedBy, updated_at: new Date().toISOString() })
    if (error) throw error
  },

  async remove(key: string, language: Language): Promise<void> {
    const { error } = await supabase.from('translation_overrides').delete().eq('key', key).eq('language', language)
    if (error) throw error
  },
}
