import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { ShellSkeleton } from '@footprints/shared/components/Skeleton'

/**
 * Only a Super Admin (`users.is_super_admin`) gets into the admin app. This is
 * a UI gate so everyone else sees a clear message; RLS and app.can() remain
 * the real enforcement on every query.
 */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { profile, loading, error } = useProfile()

  if (loading) return <ShellSkeleton />

  if (!profile?.is_super_admin) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-neutral-300" />
        <h1 className="mt-4 text-lg font-bold text-neutral-900 dark:text-neutral-50">Not authorised</h1>
        <p className="mt-1 max-w-sm text-sm text-neutral-500">
          {error ?? 'Footprints Admin is for Super Admins only. Sign in with a Super Admin account.'}
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
