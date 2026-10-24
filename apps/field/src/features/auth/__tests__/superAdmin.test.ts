import { describe, expect, it } from 'vitest'
import { isSuperAdmin } from '../superAdmin'

describe('isSuperAdmin', () => {
  it('is true only for a profile flagged as super admin', () => {
    expect(isSuperAdmin({ is_super_admin: true })).toBe(true)
    expect(isSuperAdmin({ is_super_admin: false })).toBe(false)
    expect(isSuperAdmin({ is_super_admin: null })).toBe(false)
    expect(isSuperAdmin({})).toBe(false)
    expect(isSuperAdmin(null)).toBe(false)
    expect(isSuperAdmin(undefined)).toBe(false)
  })
})
