import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

/** Keeps an already-signed-in user from seeing Welcome/Login again: /start sends them to their role's home tab. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/start" replace />
  return <>{children}</>
}
