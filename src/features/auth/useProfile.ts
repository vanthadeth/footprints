import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { Tables } from '@/types/database.types'

export type Profile = Tables<'users'> & { role_name: string | null }

interface ProfileState {
  profile: Profile | null
  loading: boolean
  error: string | null
}

/**
 * The signed-in user's own `public.users` row plus their role name.
 * This is the source of truth for name/photo/position everywhere in the
 * app -- never read auth.users metadata directly for display.
 */
export function useProfile(): ProfileState & { refresh: () => void } {
  const { session } = useAuth()
  const [state, setState] = useState<ProfileState>({ profile: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setState({ profile: null, loading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    supabase
      .from('users')
      .select('*, roles(name)')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setState({ profile: null, loading: false, error: error?.message ?? 'Profile not found' })
          return
        }
        const { roles, ...row } = data as typeof data & { roles: { name: string } | null }
        setState({ profile: { ...(row as Tables<'users'>), role_name: roles?.name ?? null }, loading: false, error: null })
      })

    return () => {
      cancelled = true
    }
  }, [session?.user.id, nonce])

  return { ...state, refresh: () => setNonce((n) => n + 1) }
}
