import { useMemo } from 'react'
import { useProfile } from '@/features/auth/useProfile'
import { usePermissions } from '@/features/permissions/PermissionsContext'
import { roleGroup, type NavContext, type RoleGroup } from './navConfig'

/** The signed-in person's navigation group and the context the nav config filters on. */
export function useRoleGroup(flexible = false): { group: RoleGroup; ctx: NavContext; ready: boolean } {
  const { profile } = useProfile()
  const { scope, ready } = usePermissions()
  return useMemo(() => {
    const ctx: NavContext = { isSuperAdmin: profile?.is_super_admin === true, scope, flexible }
    return { group: roleGroup(ctx), ctx, ready: ready && !!profile }
  }, [profile, scope, ready, flexible])
}
