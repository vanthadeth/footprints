import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { usePermissions } from './PermissionsContext'
import type { Action } from './catalog'

/** Route guard: sends people without (module, action) to `fallback` once permissions are known. */
export function RequirePermission({
  module,
  action = 'view',
  fallback = '/check-in',
  children,
}: {
  module: string
  action?: Action
  fallback?: string
  children: ReactNode
}) {
  const { ready, can } = usePermissions()
  if (ready && !can(module, action)) return <Navigate to={fallback} replace />
  return <>{children}</>
}
