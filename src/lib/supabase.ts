import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * False when VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set (e.g. a
 * deployment where the env vars were never configured). App.tsx checks
 * this before rendering the router and shows a clear setup screen instead
 * -- this module must never throw at import time, because that happens
 * before React mounts anything and used to leave a blank white page with
 * no explanation.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient<Database>(url || 'https://placeholder.invalid', anonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
