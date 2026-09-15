import { Navigate } from 'react-router-dom'
import { useProfile } from '@/features/auth/useProfile'

/**
 * Where a fresh sign-in lands. Login/ResetPassword send everyone here
 * rather than guessing a destination themselves. The field-sales Home nav
 * is disabled for now (see AppLayout/CustomersPage), so this always lands
 * on Check In -- kept as its own page/wait rather than a plain router
 * redirect so re-introducing a profile-based destination later is a
 * one-line change here again.
 */
export function StartPage() {
  const { loading } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  return <Navigate to="/check-in" replace />
}
