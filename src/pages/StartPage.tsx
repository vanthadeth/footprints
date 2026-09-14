import { Navigate } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'

/**
 * Where a fresh sign-in lands. Login/ResetPassword send everyone here
 * rather than guessing a destination themselves -- the profile (and so
 * `is_field_sales`) isn't loaded yet at the moment sign-in succeeds, and
 * this is the one place that waits for it before deciding Home (field
 * sales) vs. Check In (everyone else).
 */
export function StartPage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  return <Navigate to={profile?.is_field_sales ? '/home' : '/check-in'} replace />
}
