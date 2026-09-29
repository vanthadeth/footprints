import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { permissionsService } from './permissionsService'
import type { Action, PermRow, Scope } from './catalog'

interface PermissionsValue {
  /** True once my_permissions has answered (or a cached answer was found). */
  ready: boolean
  scope: (module: string, action: Action) => Scope | null
  can: (module: string, action: Action) => boolean
  refresh: () => void
}

const PermissionsContext = createContext<PermissionsValue | null>(null)

const cacheKey = (userId: string) => `footprints.permissions.${userId}`

function readCache(userId: string): PermRow[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    return raw ? (JSON.parse(raw) as PermRow[]) : null
  } catch {
    return null
  }
}

function writeCache(userId: string, rows: PermRow[]) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(rows))
  } catch {
    // Only saves a flicker on the next launch.
  }
}

/**
 * The caller's effective permissions (my_permissions: role rows, unexpired
 * overrides, super admin = any everywhere), for hiding tabs and rows the
 * server would refuse anyway. The last answer is cached per user so the
 * bottom bar doesn't jump on launch; RLS and the RPCs stay the real guard.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [rows, setRows] = useState<PermRow[] | null>(() => (userId ? readCache(userId) : null))

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const next = await permissionsService.myPermissions()
      setRows(next)
      writeCache(userId, next)
    } catch {
      // Keep the cached answer; without one the gates stay open (see ready).
    }
  }, [userId])

  useEffect(() => {
    setRows(userId ? readCache(userId) : null)
    load()
    const onFocus = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [userId, load])

  const value = useMemo<PermissionsValue>(() => {
    const map = new Map<string, Scope>()
    for (const r of rows ?? []) if (r.scope !== 'deny') map.set(`${r.module_key}.${r.action}`, r.scope)
    const scope = (module: string, action: Action) => map.get(`${module}.${action}`) ?? null
    return { ready: rows !== null, scope, can: (m, a) => scope(m, a) !== null, refresh: load }
  }, [rows, load])

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider')
  return ctx
}

/**
 * Whether to show something gated on (module, action). Until the first
 * answer arrives this says yes, so the common case (the feature is on)
 * never flickers in; the route guards below wait for `ready` instead.
 */
export function useCan(module: string, action: Action = 'view'): boolean {
  const { ready, can } = usePermissions()
  return !ready || can(module, action)
}
