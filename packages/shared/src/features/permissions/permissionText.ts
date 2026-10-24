import type { Direction, WorkLocation } from './permissionsService'

export const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.'

export type ClockIds = Record<Direction, string[]>

/** "at HIG Office or Warehouse" / "anywhere". */
export function placesText(ids: string[], locations: WorkLocation[]): string {
  const names = locations.filter((l) => ids.includes(l.id)).map((l) => l.name)
  return names.length ? `at ${names.join(' or ')}` : 'anywhere'
}

export function clockSummary(clock: ClockIds, locations: WorkLocation[]): string {
  const inText = placesText(clock.in, locations)
  const outText = placesText(clock.out, locations)
  if (inText === 'anywhere' && outText === 'anywhere') return 'Anywhere, in and out'
  if (inText === outText) return `In and out ${inText}`
  return `In ${inText} · out ${outText}`
}

export function sameIds(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b
  return a.length === b.length && a.every((id) => b.includes(id))
}
