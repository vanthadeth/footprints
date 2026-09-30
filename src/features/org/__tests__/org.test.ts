import { describe, expect, it } from 'vitest'
import { deactivateNote, nameProblem, orgErrorText, peopleText, sortItems } from '../org'
import type { OrgItem } from '../orgService'

const item = (over: Partial<OrgItem>): OrgItem => ({ kind: 'role', id: 'x', name: 'X', description: null, key: null, active: true, sort_order: 1, people: 0, ...over })

const items = [
  item({ id: 'r1', name: 'Sales Team', sort_order: 2, people: 3 }),
  item({ id: 'r2', name: 'HR', sort_order: 1 }),
  item({ id: 'r3', name: 'Old role', sort_order: 0, active: false }),
  item({ id: 'd1', kind: 'department', name: 'Sales' }),
]

describe('org helpers', () => {
  it('counts people', () => {
    expect([0, 1, 5].map(peopleText)).toEqual(['Nobody yet', '1 person', '5 people'])
  })

  it('checks names like the server', () => {
    expect(nameProblem('  ', 'role', items, null)).toBe('A role needs a name.')
    expect(nameProblem('sales team', 'role', items, null)).toBe('There is already a role called Sales Team.')
    expect(nameProblem('Sales Team ', 'role', items, 'r1')).toBeNull()
    // Departments and roles are checked separately.
    expect(nameProblem('Sales', 'role', items, null)).toBeNull()
    expect(nameProblem('sales', 'department', items, null)).toBe('There is already a department called Sales.')
  })

  it('explains deactivating', () => {
    expect(deactivateNote('role', 3)).toBe('3 people keep this role; it won’t be offered for new people.')
    expect(deactivateNote('department', 1)).toBe('1 person keeps this department; it won’t be offered for new people.')
    expect(deactivateNote('role', 0)).toBe('It won’t be offered for new people.')
  })

  it('lists active first in their order', () => {
    expect(sortItems(items, 'role').map((i) => i.id)).toEqual(['r2', 'r1', 'r3'])
  })

  it('reads server errors', () => {
    expect(orgErrorText({ message: 'invalid_input', details: 'A role needs a name.' })).toBe('A role needs a name.')
    expect(orgErrorText({ message: 'insufficient_privilege', details: null })).toBe('Only a Super Admin can manage departments and roles.')
  })
})
