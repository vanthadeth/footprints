import type { OrgItem } from './orgService'

export type OrgKind = OrgItem['kind']

export function peopleText(n: number): string {
  return n === 0 ? 'Nobody yet' : `${n} ${n === 1 ? 'person' : 'people'}`
}

/** Same rule as the server: a name is required and can't repeat another one of the same kind (ignoring case). */
export function nameProblem(name: string, kind: OrgKind, items: OrgItem[], editingId: string | null): string | null {
  const n = name.trim()
  if (!n) return kind === 'role' ? 'A role needs a name.' : 'A department needs a name.'
  const clash = items.find((i) => i.kind === kind && i.id !== editingId && i.name.trim().toLowerCase() === n.toLowerCase())
  return clash ? `There is already a ${kind} called ${clash.name}.` : null
}

/** What switching something off means for the people in it. */
export function deactivateNote(kind: OrgKind, people: number): string {
  const what = kind === 'role' ? 'role' : 'department'
  if (people === 0) return `It won’t be offered for new people.`
  return `${peopleText(people)} keep${people === 1 ? 's' : ''} this ${what}; it won’t be offered for new people.`
}

/** Active first (in their set order), then switched-off ones. */
export function sortItems(items: OrgItem[], kind: OrgKind): OrgItem[] {
  return items
    .filter((i) => i.kind === kind)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/** The server's readable reason (PostgREST puts it in `details`), else the message. */
export function orgErrorText(e: unknown): string {
  const err = e as { details?: string | null; message?: string } | null
  if (err?.details) return err.details
  if (err?.message === 'insufficient_privilege') return 'Only a Super Admin can manage departments and roles.'
  return err?.message || 'Something went wrong.'
}
