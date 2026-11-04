import { usePermissions } from '@footprints/shared/features/permissions/PermissionsContext'
import { adminAccess, type AdminAccess } from './adminAccess'

/** The signed-in person's admin-app access; `ready` is false until their permissions have loaded. */
export function useAdminAccess(isSuperAdmin: boolean): { access: AdminAccess; ready: boolean } {
  const { ready, scope } = usePermissions()
  return { access: adminAccess(isSuperAdmin, scope('survey', 'edit')), ready }
}
