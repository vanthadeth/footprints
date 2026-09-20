export interface HierarchyUser {
  id: string
  managerId: string | null
}

/** Every user reporting up to `managerId`, directly or transitively -- `users` can be a `ManagedUser[]` as-is. */
export function getAllSubordinator(managerId: string, users: HierarchyUser[]): string[] {
  const childrenByManager = new Map<string, string[]>()
  for (const user of users) {
    if (!user.managerId) continue
    const children = childrenByManager.get(user.managerId)
    if (children) children.push(user.id)
    else childrenByManager.set(user.managerId, [user.id])
  }

  const result: string[] = []
  const seen = new Set<string>()
  const queue = [...(childrenByManager.get(managerId) ?? [])]
  for (const id of queue) seen.add(id)

  while (queue.length > 0) {
    const id = queue.shift()!
    result.push(id)
    for (const childId of childrenByManager.get(id) ?? []) {
      // Guards against a cyclic manager_id chain in bad data.
      if (seen.has(childId)) continue
      seen.add(childId)
      queue.push(childId)
    }
  }

  return result
}

/** Whether `userId` reports up to `managerId`, directly or transitively -- walks up userId's chain rather than materializing the whole subtree. */
export function isMySubordinator(managerId: string, userId: string, users: HierarchyUser[]): boolean {
  const managerById = new Map(users.map((user) => [user.id, user.managerId]))

  const seen = new Set<string>()
  let currentId: string | null = managerById.get(userId) ?? null
  while (currentId && !seen.has(currentId)) {
    if (currentId === managerId) return true
    seen.add(currentId)
    currentId = managerById.get(currentId) ?? null
  }
  return false
}
