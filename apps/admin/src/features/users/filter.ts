import type { ManagedUser } from '@footprints/shared/features/users/usersService'

export type StatusFilter = 'active' | 'inactive' | 'all'

/** Whether a user passes the search text and the status / department / role filters. */
export function matchesUser(u: ManagedUser, q: string, status: StatusFilter, departmentId: string, roleId: string): boolean {
  if (status === 'active' && u.status !== 'active') return false
  if (status === 'inactive' && u.status === 'active') return false
  if (departmentId && u.departmentId !== departmentId) return false
  if (roleId && u.roleId !== roleId) return false
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [u.fullName, u.nickname, u.email, u.position, u.phonePrimary].some((v) => v?.toLowerCase().includes(needle))
}
