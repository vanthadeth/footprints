import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { ShellSkeleton } from '@/components/Skeleton'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <ShellSkeleton />

  if (!session) {
    return <Navigate to="/welcome" replace state={{ from: location }} />
  }

  return <>{children}</>
}
