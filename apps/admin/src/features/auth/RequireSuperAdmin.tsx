import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { ShellSkeleton } from '@footprints/shared/components/Skeleton'
import { useAdminAccess } from './useAdminAccess'

/**
 * Only a Super Admin (`users.is_super_admin`) gets into the admin app, with one
 * exception: someone who can build survey templates (survey edit at All scope)
 * gets in too, but AdminLayout limits them to the Surveys section. This is a
 * UI gate so everyone else sees a clear message; RLS and app.can() remain the
 * real enforcement on every query.
 */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { profile, loading, error } = useProfile()
  const { access, ready } = useAdminAccess(!!profile?.is_super_admin)

  if (loading || (!profile?.is_super_admin && !ready)) return <ShellSkeleton />

  if (access === 'none') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-neutral-300" />
        <h1 className="mt-4 text-lg font-bold text-neutral-900 dark:text-neutral-50">Not authorised</h1>
        <p className="mt-1 max-w-sm text-sm text-neutral-500">
          {error ?? 'Footprints Admin is for Super Admins, and for people who set up surveys. Sign in with one of those accounts.'}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white"
        >
          Sign out
        </button>
      </div>
    )
  }
  return <>{children}</>
}
