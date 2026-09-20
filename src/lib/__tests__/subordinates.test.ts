import { describe, expect, it } from 'vitest'
import { getAllSubordinator, isMySubordinator, type HierarchyUser } from '../subordinates'

function user(id: string, managerId: string | null): HierarchyUser {
  return { id, managerId }
}

// ceo
//  └─ manager
//       ├─ lead
//       │    └─ junior
//       └─ peer (reports to manager, no reports of its own)
// outsider reports to no one in this tree
const org: HierarchyUser[] = [
  user('ceo', null),
  user('manager', 'ceo'),
  user('lead', 'manager'),
  user('junior', 'lead'),
  user('peer', 'manager'),
  user('outsider', null),
]

describe('getAllSubordinator', () => {
  it('includes direct and transitive reports of a mid-level manager', () => {
    expect(getAllSubordinator('manager', org).sort()).toEqual(['junior', 'lead', 'peer'])
  })

  it('includes transitive (multi-level) reports', () => {
    expect(getAllSubordinator('ceo', org).sort()).toEqual(['junior', 'lead', 'manager', 'peer'])
  })

  it('returns an empty array for a user with no reports', () => {
    expect(getAllSubordinator('junior', org)).toEqual([])
  })

  it('returns an empty array for a manager id not present in the list', () => {
    expect(getAllSubordinator('nobody', org)).toEqual([])
  })

  it('terminates on cyclic manager_id data instead of looping forever', () => {
    const cyclic: HierarchyUser[] = [user('a', 'b'), user('b', 'a')]
    expect(getAllSubordinator('a', cyclic).sort()).toEqual(['a', 'b'])
  })
})

describe('isMySubordinator', () => {
  it('is true for a direct report', () => {
    expect(isMySubordinator('manager', 'lead', org)).toBe(true)
  })

  it('is true for a transitive report', () => {
    expect(isMySubordinator('ceo', 'junior', org)).toBe(true)
  })

  it('is false for an unrelated user', () => {
    expect(isMySubordinator('manager', 'outsider', org)).toBe(false)
  })

  it('is false when the arguments are reversed -- a manager is not their own subordinate\'s subordinate', () => {
    expect(isMySubordinator('lead', 'manager', org)).toBe(false)
  })

  it('is false for a user checked against themselves', () => {
    expect(isMySubordinator('manager', 'manager', org)).toBe(false)
  })

  it('does not infinite-loop on cyclic manager_id data', () => {
    const cyclic: HierarchyUser[] = [user('a', 'b'), user('b', 'a')]
    expect(isMySubordinator('a', 'nonexistent', cyclic)).toBe(false)
  })
})
