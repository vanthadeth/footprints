import { supabase } from '@/lib/supabase'

export type UserStatus = 'active' | 'suspended' | 'discharged'

export interface ManagedUser {
  id: string
  fullName: string
  email: string | null
  phonePrimary: string | null
  photoPath: string | null
  position: string | null
  departmentId: string | null
  departmentName: string | null
  managerId: string | null
  managerName: string | null
  roleId: string | null
  roleName: string | null
  status: UserStatus
  isSuperAdmin: boolean
  isFieldSales: boolean
  mustChangePassword: boolean
  employmentDate: string | null
  createdAt: string
}

export interface Option {
  id: string
  name: string
}

export interface CreateUserInput {
  fullName: string
  email: string
  roleId: string
  phonePrimary?: string | null
  position?: string | null
  departmentId?: string | null
  managerId?: string | null
  isFieldSales?: boolean
}

export interface EditUserInput {
  fullName: string
  phonePrimary: string | null
  position: string | null
  departmentId: string | null
  managerId: string | null
  roleId: string | null
  status: UserStatus
  isFieldSales: boolean
  /** Required by a DB check constraint when status is 'suspended'; ignored otherwise. */
  suspendedFrom?: string | null
  suspendedTo?: string | null
  /** Required by a DB check constraint when status is 'discharged'; ignored otherwise. */
  dischargedDate?: string | null
}

/** Calls the `admin-users` Edge Function, surfacing its JSON `{ error }` body (if any) as a normal thrown Error. */
async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const parsed = await context.clone().json()
        if (parsed && typeof parsed.error === 'string') throw new Error(parsed.error)
      } catch {
        // Body wasn't JSON (or already thrown above) -- fall through to the generic message below.
      }
    }
    throw new Error(error.message)
  }
  return data as T
}

function fromRow(row: {
  id: string
  full_name: string
  email: string | null
  phone_primary: string | null
  photo_path: string | null
  position: string | null
  department_id: string | null
  department_name: string | null
  manager_id: string | null
  manager_name: string | null
  role_id: string | null
  role_name: string | null
  status: string
  is_super_admin: boolean
  is_field_sales: boolean
  must_change_password: boolean
  employment_date: string | null
  created_at: string
}): ManagedUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phonePrimary: row.phone_primary,
    photoPath: row.photo_path,
    position: row.position,
    departmentId: row.department_id,
    departmentName: row.department_name,
    managerId: row.manager_id,
    managerName: row.manager_name,
    roleId: row.role_id,
    roleName: row.role_name,
    status: row.status as UserStatus,
    isSuperAdmin: row.is_super_admin,
    isFieldSales: row.is_field_sales,
    mustChangePassword: row.must_change_password,
    employmentDate: row.employment_date,
    createdAt: row.created_at,
  }
}

/**
 * Everything the Users screen needs: listing (via app.manageable_users(),
 * scoped by the user:view permission the same way every other RLS-gated
 * read is), plain field edits (RLS on `users` already allows these for
 * anyone with user:edit), and the two actions that need the Auth Admin API
 * and so must go through the admin-users Edge Function -- create a login,
 * and issue a fresh temporary password. Never call supabase.auth.admin.*
 * from the client; the service-role key that requires lives only in that
 * function.
 */
export const usersService = {
  async list(): Promise<ManagedUser[]> {
    const { data, error } = await supabase.rpc('manageable_users')
    if (error) throw error
    return (data ?? []).map(fromRow)
  },

  async listRoles(): Promise<Option[]> {
    const { data, error } = await supabase.from('roles').select('id, name').order('name')
    if (error) throw error
    return data ?? []
  },

  async listDepartments(): Promise<Option[]> {
    const { data, error } = await supabase.from('departments').select('id, name').eq('active', true).order('sort_order')
    if (error) throw error
    return data ?? []
  },

  async update(userId: string, input: EditUserInput): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        full_name: input.fullName,
        phone_primary: input.phonePrimary,
        position: input.position,
        department_id: input.departmentId,
        manager_id: input.managerId,
        role_id: input.roleId,
        status: input.status,
        is_field_sales: input.isFieldSales,
        // Only sent when relevant -- DB check constraints require these
        // exact fields when status is suspended/discharged, and don't care
        // about stale values from a previous suspension otherwise.
        ...(input.status === 'suspended' ? { suspended_from: input.suspendedFrom, suspended_to: input.suspendedTo } : {}),
        ...(input.status === 'discharged' ? { discharged_date: input.dischargedDate } : {}),
      })
      .eq('id', userId)
    if (error) throw error
  },

  /** Creates the login (Supabase Auth user) and the matching `users` row. Returns a one-time temporary password to relay to the new hire. */
  async create(input: CreateUserInput): Promise<{ userId: string; tempPassword: string }> {
    return invokeAdmin<{ userId: string; tempPassword: string }>({
      action: 'create',
      email: input.email,
      fullName: input.fullName,
      roleId: input.roleId,
      phonePrimary: input.phonePrimary ?? null,
      position: input.position ?? null,
      departmentId: input.departmentId ?? null,
      managerId: input.managerId ?? null,
      isFieldSales: input.isFieldSales ?? false,
    })
  },

  /** Sets a new random password and flags the account so the user must set their own at next sign-in. Returns the one-time temporary password to relay to them. */
  async resetPassword(userId: string): Promise<{ tempPassword: string }> {
    return invokeAdmin<{ tempPassword: string }>({ action: 'reset_password', userId })
  },
}
