/** Groups items by a string key, preserving each group's first-seen order and each item's original order within it. */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

/** Alphabetical group-key order, with `ungroupedKey` (e.g. an empty/"No Department" bucket) always sorted last. */
export function sortGroupKeys(keys: Iterable<string>, ungroupedKey: string): string[] {
  return [...keys].sort((a, b) => {
    if (a === ungroupedKey) return 1
    if (b === ungroupedKey) return -1
    return a.localeCompare(b)
  })
}
