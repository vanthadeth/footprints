import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { homeFor } from '@/features/nav/navConfig'

/**
 * Where a fresh sign-in lands. Login/ResetPassword send everyone here
 * rather than guessing a destination themselves: each role group's home
 * tab (features/nav/navConfig.homeFor) -- Check In for salespeople, Team
 * for managers, People for HR, Today for the back office -- once the
 * profile and permissions have loaded.
 */
export function StartPage() {
  const { loading } = useProfile()
  const { group, ctx, ready } = useRoleGroup()
  // If permissions can't load (offline, first launch), don't hold sign-in: Check In works for everyone.
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setGaveUp(true), 4000)
    return () => window.clearTimeout(t)
  }, [])

  if (!ready && gaveUp && !loading) return <Navigate to="/check-in" replace />
  if (loading || !ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  return <Navigate to={homeFor(group, ctx)} replace />
}
