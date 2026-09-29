import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/rpc'
import type { OverrideChange, PermRow, RowChange } from './catalog'

export type Direction = 'in' | 'out'

export interface RoleRow {
  id: string
  key: string
  name: string
}

export interface PersonRow {
  id: string
  full_name: string
  nickname: string | null
  position: string | null
  role_id: string | null
  is_super_admin: boolean
}

export interface RolePermRow extends PermRow {
  role_id: string
}

export interface OverrideRow extends PermRow {
  user_id: string
  note: string | null
  expires_at: string | null
}

/** A clock_location_rules row (0094): exactly one of role_id / user_id; empty location_ids = anywhere. */
export interface ClockRule {
  id: string
  role_id: string | null
  user_id: string | null
  direction: Direction
  location_ids: string[]
  note: string | null
}

export interface WorkLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_m: number
  active: boolean
}

export type RequiredLocation = Pick<WorkLocation, 'id' | 'name' | 'latitude' | 'longitude' | 'radius_m'>

/** Everything the Permissions screens need, in one round of reads. */
export interface PermissionsData {
  roles: RoleRow[]
  people: PersonRow[]
  rolePerms: RolePermRow[]
  overrides: OverrideRow[]
  clockRules: ClockRule[]
  locations: WorkLocation[]
}

/**
 * Reads go straight to the tables (RLS lets Super Admin / System Admin see
 * them all); writes go through the 0094 RPCs, which re-check that the
 * caller may manage permissions.
 */
export const permissionsService = {
  async load(): Promise<PermissionsData> {
    const [roles, people, rolePerms, overrides, clockRules, locations] = await Promise.all([
      supabase.from('roles').select('id, key, name').order('name'),
      supabase
        .from('users')
        .select('id, full_name, nickname, position, role_id, is_super_admin')
        .eq('status', 'active')
        .order('full_name'),
      supabase.from('role_permissions').select('role_id, module_key, action, scope'),
      supabase.from('user_permission_overrides').select('user_id, module_key, action, scope, note, expires_at'),
      supabase.from('clock_location_rules').select('id, role_id, user_id, direction, location_ids, note'),
      supabase.from('work_locations').select('id, name, latitude, longitude, radius_m, active').order('name'),
    ])
    for (const r of [roles, people, rolePerms, overrides, clockRules, locations]) if (r.error) throw r.error
    return {
      roles: (roles.data ?? []) as RoleRow[],
      people: (people.data ?? []) as PersonRow[],
      rolePerms: (rolePerms.data ?? []) as RolePermRow[],
      overrides: (overrides.data ?? []) as OverrideRow[],
      clockRules: (clockRules.data ?? []) as ClockRule[],
      locations: (locations.data ?? []) as WorkLocation[],
    }
  },

  setRolePermissions(roleId: string, rows: RowChange[]): Promise<number> {
    return callRpc<number>('set_role_permissions', { p_role_id: roleId, p_rows: rows })
  },

  setUserOverrides(userId: string, rows: OverrideChange[]): Promise<number> {
    return callRpc<number>('set_user_overrides', { p_user_id: userId, p_rows: rows })
  },

  /** locationIds null removes the rule (role → anywhere, person → use role). */
  setClockRule(target: { roleId: string } | { userId: string }, direction: Direction, locationIds: string[] | null, note?: string | null): Promise<void> {
    return callRpc<void>('set_clock_location_rule', {
      p_role_id: 'roleId' in target ? target.roleId : null,
      p_user_id: 'userId' in target ? target.userId : null,
      p_direction: direction,
      p_location_ids: locationIds,
      p_note: note ?? null,
    })
  },

  myPermissions(): Promise<PermRow[]> {
    return callRpc<PermRow[]>('my_permissions')
  },

  myClockRules(): Promise<Record<Direction, RequiredLocation[]>> {
    return callRpc<Record<Direction, RequiredLocation[]>>('my_clock_rules')
  },
}
