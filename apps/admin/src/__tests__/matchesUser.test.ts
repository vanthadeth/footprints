import { describe, expect, it } from 'vitest'
import type { ManagedUser } from '@footprints/shared/features/users/usersService'
import { matchesUser } from '../features/users/filter'

const user = (over: Partial<ManagedUser>): ManagedUser => ({
  id: '1', fullName: 'Sok Dara', nickname: 'Dara', email: 'dara@hig.com', phonePrimary: '012 345 678', photoPath: null, position: 'Sales Executive',
  departmentId: 'd1', departmentName: 'Sales', managerId: null, managerName: null, roleId: 'r1', roleName: 'Salesperson', status: 'active',
  isSuperAdmin: false, isFieldSales: true, employmentDate: null, createdAt: '', telegramId: null, ...over,
})

describe('matchesUser', () => {
  it('hides inactive people unless asked', () => {
    const left = user({ status: 'discharged' })
    expect(matchesUser(left, '', 'active', '', '')).toBe(false)
    expect(matchesUser(left, '', 'inactive', '', '')).toBe(true)
    expect(matchesUser(left, '', 'all', '', '')).toBe(true)
  })
  it('filters by department and role', () => {
    expect(matchesUser(user({}), '', 'all', 'd2', '')).toBe(false)
    expect(matchesUser(user({}), '', 'all', 'd1', 'r2')).toBe(false)
    expect(matchesUser(user({}), '', 'all', 'd1', 'r1')).toBe(true)
  })
  it('searches name, nickname, email, position and phone case-insensitively', () => {
    for (const q of ['SOK', 'dara', 'HIG.com', 'executive', '345']) expect(matchesUser(user({}), q, 'all', '', '')).toBe(true)
    expect(matchesUser(user({}), 'nobody', 'all', '', '')).toBe(false)
  })
})
