/** Only a Super Admin (users.is_super_admin) may open the attendance roster. A UI gate; app.can() and RLS stay the real enforcement. */
export function isSuperAdmin(profile: { is_super_admin?: boolean | null } | null | undefined): boolean {
  return profile?.is_super_admin === true
}
