import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { ShellSkeleton } from '@footprints/shared/components/Skeleton'
import { isSuperAdmin } from './superAdmin'

/** Route guard: waits for the profile, then sends anyone who is not a Super Admin to the menu. */
export function RequireSuperAdmin({ children, fallback = '/menu' }: { children: ReactNode; fallback?: string }) {
  const { profile, loading } = useProfile()
  if (loading && !profile) return <ShellSkeleton />
  if (!isSuperAdmin(profile)) return <Navigate to={fallback} replace />
  return <>{children}</>
}
