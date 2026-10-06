import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { Tables } from '@/types/database.types'

export type Profile = Tables<'users'> & { role_name: string | null }

interface ProfileState {
  profile: Profile | null
  loading: boolean
  error: string | null
}

const cacheKey = (userId: string) => `footprints.profile.${userId}`
/** A profile read this recently isn't fetched again when another screen asks for it. */
const FRESH_MS = 60_000

let userId: string | null = null
let state: ProfileState = { profile: null, loading: true, error: null }
let fetchedAt = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: ProfileState) {
  state = next
  listeners.forEach((l) => l())
}

function readCache(id: string): Profile | null {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function writeCache(id: string, profile: Profile) {
  try {
    localStorage.setItem(cacheKey(id), JSON.stringify(profile))
  } catch {
    // Only saves a moment on the next launch.
  }
}

/**
 * Switch to a user: their last saved profile straight away, then the live
 * one. Runs during render, so it only swaps the value; the effect in
 * useProfile tells the other screens.
 */
function selectUser(id: string | null) {
  if (id === userId) return
  userId = id
  fetchedAt = 0
  inflight = null
  const cached = id ? readCache(id) : null
  state = { profile: cached, loading: !!id && !cached, error: null }
}

function load(force = false): Promise<void> {
  const id = userId
  if (!id) return Promise.resolve()
  if (inflight) return inflight
  if (!force && Date.now() - fetchedAt < FRESH_MS) return Promise.resolve()
  inflight = (async () => {
    const { data, error } = await supabase.from('users').select('*, roles(name)').eq('id', id).single()
    if (id !== userId) return
    fetchedAt = Date.now()
    if (error || !data) {
      // Keep a saved profile if there is one (offline); only report the error without one.
      set({ profile: state.profile, loading: false, error: state.profile ? null : (error?.message ?? 'Profile not found') })
      return
    }
    const { roles, ...row } = data as typeof data & { roles: { name: string } | null }
    const profile = { ...(row as Tables<'users'>), role_name: roles?.name ?? null }
    writeCache(id, profile)
    set({ profile, loading: false, error: null })
  })().finally(() => {
    inflight = null
  })
  return inflight
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * The signed-in user's own `public.users` row plus their role name.
 * This is the source of truth for name/photo/position everywhere in the
 * app -- never read auth.users metadata directly for display. One copy is
 * shared by every screen and saved on the device, so the app opens with
 * the right name, role and tabs at once; it's refreshed in the background
 * (at most once a minute, or on `refresh()`).
 */
export function useProfile(): ProfileState & { refresh: () => void } {
  const { session } = useAuth()
  const id = session?.user.id ?? null
  selectUser(id)
  const snapshot = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    listeners.forEach((l) => l())
    void load()
  }, [id])
  return { ...snapshot, refresh: () => void load(true) }
}
