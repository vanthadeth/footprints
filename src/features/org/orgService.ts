import { callRpc } from '@/lib/rpc'

/** One row of org_overview: a role or a department with how many active people are in it. */
export interface OrgItem {
  kind: 'role' | 'department'
  id: string
  name: string
  description: string | null
  key: string | null
  active: boolean
  sort_order: number
  people: number
}

/** Departments and roles, managed by the Super Admin (0097). Nothing is deleted -- only switched off. */
export const orgService = {
  overview(): Promise<OrgItem[]> {
    return callRpc<OrgItem[]>('org_overview').then((r) => r ?? [])
  },

  saveDepartment(input: { id: string | null; name: string; active: boolean }): Promise<string> {
    return callRpc<string>('save_department', { p_id: input.id, p_name: input.name, p_active: input.active })
  },

  saveRole(input: { id: string | null; name: string; description: string; active: boolean; copyFrom: string | null }): Promise<string> {
    return callRpc<string>('save_role', {
      p_id: input.id,
      p_name: input.name,
      p_description: input.description,
      p_active: input.active,
      p_copy_from: input.copyFrom,
    })
  },
}
