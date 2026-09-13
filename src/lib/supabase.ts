import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Vite inlines each `import.meta.env.VITE_*` reference at build time by
// static text match -- it cannot resolve a dynamically-built key, so a
// fallback name has to be written out as its own literal reference here,
// not read via `import.meta.env[name]`. `_2` fallbacks exist because on
// some Vercel projects the plain names collide with a var already managed
// by another integration and can't be overwritten -- set either pair.
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL_2
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY_2

/**
 * False when neither VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY nor their
 * _2 fallbacks are set (e.g. a deployment where the env vars were never
 * configured). App.tsx checks this before rendering the router and shows
 * a clear setup screen instead -- this module must never throw at import
 * time, because that happens before React mounts anything and used to
 * leave a blank white page with no explanation.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient<Database>(url || 'https://placeholder.invalid', anonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
