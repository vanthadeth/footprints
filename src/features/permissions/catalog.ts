/**
 * The Permissions settings catalogue: the design's plain-language
 * functions ("Approve / reject leave", "Clock in / out"...) mapped onto the
 * (module, action, scope) rows that app.can() actually enforces.
 *
 * Only the (module, action) pairs listed in OWNED are ever written, and
 * only for functions the admin changed -- every other row a role has
 * (invoice, product, visit.view...) is left exactly as it is.
 */

export type Scope = 'own' | 'sub' | 'any'
export type DbScope = Scope | 'deny'
export type Action = 'view' | 'add' | 'edit' | 'delete'

export interface PermRow {
  module_key: string
  action: Action
  scope: DbScope
}

/** A change for set_role_permissions / set_user_overrides; scope null = remove the row. */
export interface RowChange {
  module_key: string
  action: Action
  scope: DbScope | null
}

export type FnKey =
  | 'footprints'
  | 'clock'
  | 'visit'
  | 'plan'
  | 'customer_view'
  | 'conversation_view'
  | 'customer_call'
  | 'customer_edit'
  | 'att_view'
  | 'att_override'
  | 'team_map'
  | 'leave_request'
  | 'leave_approve'
  | 'leave_allow'
  | 'users'
  | 'settings'

/** null = not allowed; scope null = an on/off function. */
export type Grant = { scope: Scope | null } | null
export type FnState = Record<FnKey, Grant>

export interface FnMeta {
  key: FnKey
  label: string
  help: string
  /** Scopes the admin can pick; null for on/off functions. */
  scopes: Scope[] | null
  /** Clock in / out also carries location rules. */
  locations?: boolean
}

export const SCOPE_LABEL: Record<Scope, string> = { own: 'Self', sub: 'Team', any: 'All' }

export const GROUPS: { name: string; fns: FnMeta[] }[] = [
  {
    name: 'Footprints',
    fns: [
      { key: 'footprints', label: 'Use Footprints', help: 'Tracking, journey map and the Footprints tab', scopes: null },
      { key: 'clock', label: 'Clock in / out', help: 'Daily attendance with selfie and GPS', scopes: null, locations: true },
      { key: 'visit', label: 'Check in / out at customers', help: 'Customer visits and outcomes', scopes: null },
      { key: 'plan', label: 'Today’s plan & route', help: 'Planned stops and suggested route', scopes: null },
    ],
  },
  {
    name: 'Customers',
    fns: [
      { key: 'customer_view', label: 'View customers', help: 'Customer list, map and details', scopes: ['own', 'sub', 'any'] },
      { key: 'conversation_view', label: 'Read & reply to conversations', help: 'See calls and notes on customers, reply and react', scopes: ['any'] },
      { key: 'customer_call', label: 'Call customers & log calls', help: 'Outgoing and incoming calls with purpose and notes', scopes: ['own', 'sub', 'any'] },
      { key: 'customer_edit', label: 'Add / edit customers', help: 'Create customers and change their details', scopes: ['own', 'sub', 'any'] },
    ],
  },
  {
    name: 'Attendance & team',
    fns: [
      { key: 'att_view', label: 'View attendance', help: 'Clock-ins, lateness and summaries', scopes: ['own', 'sub', 'any'] },
      { key: 'att_override', label: 'Correct attendance', help: 'Fix or override clock-in/out records', scopes: ['sub', 'any'] },
      { key: 'team_map', label: 'Team map & live locations', help: 'The Team tab: where the team is right now', scopes: ['sub', 'any'] },
    ],
  },
  {
    name: 'Leave',
    fns: [
      { key: 'leave_request', label: 'Request leave', help: 'Ask for annual, sick or unpaid leave', scopes: null },
      { key: 'leave_approve', label: 'Approve / reject leave', help: 'Decide on leave requests', scopes: ['sub', 'any'] },
      { key: 'leave_allow', label: 'Manage leave allowances', help: 'Company default and per-person allowances', scopes: ['any'] },
    ],
  },
  {
    name: 'Admin',
    fns: [
      { key: 'users', label: 'Manage users', help: 'Add people, change their details', scopes: ['sub', 'any'] },
      { key: 'settings', label: 'Settings & attendance rules', help: 'Working hours, holidays, locations', scopes: ['any'] },
    ],
  },
]

export const FNS: FnMeta[] = GROUPS.flatMap((g) => g.fns)
export const FN_BY_KEY: Record<FnKey, FnMeta> = Object.fromEntries(FNS.map((f) => [f.key, f])) as Record<FnKey, FnMeta>

type PairKey = `${string}.${Action}`
const pair = (m: string, a: Action): PairKey => `${m}.${a}`

/** Each owned (module, action) pair, the functions that decide it, and how. */
const OWNED: { m: string; a: Action; from: FnKey[]; value: (s: FnState, current: Scope | null) => Scope | null }[] = [
  { m: 'footprints', a: 'view', from: ['footprints'], value: (s, c) => (s.footprints ? (c ?? 'own') : null) },
  { m: 'plan', a: 'view', from: ['plan'], value: (s, c) => (s.plan ? (c ?? 'own') : null) },
  { m: 'visit', a: 'add', from: ['visit'], value: (s, c) => (s.visit ? (c ?? 'own') : null) },
  { m: 'visit', a: 'edit', from: ['visit'], value: (s, c) => (s.visit ? (c ?? 'own') : null) },
  // Clocking needs your own attendance: add to clock in, edit to clock out, view to see it.
  { m: 'attendance', a: 'add', from: ['clock'], value: (s, c) => (s.clock ? (c ?? 'own') : null) },
  { m: 'attendance', a: 'view', from: ['att_view', 'clock'], value: (s) => s.att_view?.scope ?? (s.clock ? 'own' : null) },
  { m: 'attendance', a: 'edit', from: ['att_override', 'clock'], value: (s) => s.att_override?.scope ?? (s.clock ? 'own' : null) },
  { m: 'customer', a: 'view', from: ['customer_view'], value: (s) => s.customer_view?.scope ?? null },
  { m: 'customer', a: 'add', from: ['customer_edit'], value: (s) => s.customer_edit?.scope ?? null },
  { m: 'customer', a: 'edit', from: ['customer_edit'], value: (s) => s.customer_edit?.scope ?? null },
  { m: 'customer_conversation', a: 'view', from: ['conversation_view'], value: (s) => s.conversation_view?.scope ?? null },
  { m: 'customer_conversation', a: 'add', from: ['customer_call'], value: (s) => s.customer_call?.scope ?? null },
  { m: 'team_map', a: 'view', from: ['team_map'], value: (s) => s.team_map?.scope ?? null },
  // Requesting leave needs your own requests: add to ask, view/edit to see and cancel them.
  { m: 'leave', a: 'add', from: ['leave_request'], value: (s, c) => (s.leave_request ? (c ?? 'own') : null) },
  { m: 'leave', a: 'view', from: ['leave_approve', 'leave_request'], value: (s) => s.leave_approve?.scope ?? (s.leave_request ? 'own' : null) },
  { m: 'leave', a: 'edit', from: ['leave_approve', 'leave_request'], value: (s) => s.leave_approve?.scope ?? (s.leave_request ? 'own' : null) },
  { m: 'leave_balance', a: 'edit', from: ['leave_allow'], value: (s) => s.leave_allow?.scope ?? null },
  { m: 'user', a: 'add', from: ['users'], value: (s) => s.users?.scope ?? null },
  { m: 'user', a: 'edit', from: ['users'], value: (s) => s.users?.scope ?? null },
  { m: 'settings', a: 'edit', from: ['settings'], value: (s) => s.settings?.scope ?? null },
]

export type ScopeMap = Map<PairKey, Scope>

/** Effective scopes from rows ('deny' and missing both mean no access). */
export function toScopeMap(rows: PermRow[]): ScopeMap {
  const m: ScopeMap = new Map()
  for (const r of rows) if (r.scope !== 'deny') m.set(pair(r.module_key, r.action), r.scope)
  return m
}

/** Role rows with a person's (unexpired) overrides laid on top -- what effective_scope computes. */
export function mergeOverrides(roleRows: PermRow[], overrides: (PermRow & { expires_at?: string | null })[], now: Date = new Date()): PermRow[] {
  const byPair = new Map<PairKey, PermRow>(roleRows.map((r) => [pair(r.module_key, r.action), r]))
  for (const o of overrides) {
    if (o.expires_at && new Date(o.expires_at) <= now) continue
    byPair.set(pair(o.module_key, o.action), { module_key: o.module_key, action: o.action, scope: o.scope })
  }
  return [...byPair.values()]
}

/** Which functions a set of rows grants, and at what scope. */
export function deriveState(rows: PermRow[]): FnState {
  const m = toScopeMap(rows)
  const get = (mod: string, a: Action) => m.get(pair(mod, a)) ?? null
  const onOff = (s: Scope | null): Grant => (s ? { scope: null } : null)
  const scoped = (s: Scope | null): Grant => (s ? { scope: s } : null)
  const wide = (s: Scope | null): Grant => (s === 'sub' || s === 'any' ? { scope: s } : null)
  return {
    footprints: onOff(get('footprints', 'view')),
    clock: onOff(get('attendance', 'add')),
    visit: onOff(get('visit', 'add')),
    plan: onOff(get('plan', 'view')),
    customer_view: scoped(get('customer', 'view')),
    conversation_view: scoped(get('customer_conversation', 'view')),
    customer_call: scoped(get('customer_conversation', 'add')),
    customer_edit: scoped(get('customer', 'edit')),
    att_view: scoped(get('attendance', 'view')),
    att_override: wide(get('attendance', 'edit')),
    team_map: scoped(get('team_map', 'view')),
    leave_request: onOff(get('leave', 'add')),
    leave_approve: wide(get('leave', 'edit')),
    leave_allow: scoped(get('leave_balance', 'edit')),
    users: wide(get('user', 'edit')),
    settings: scoped(get('settings', 'edit')),
  }
}

export function sameGrant(a: Grant, b: Grant): boolean {
  if (a === null || b === null) return a === b
  return a.scope === b.scope
}

export function changedFns(before: FnState, after: FnState): FnKey[] {
  return FNS.map((f) => f.key).filter((k) => !sameGrant(before[k], after[k]))
}

/**
 * The owned pairs whose value changes when `rows` (a role's, or a person's
 * effective rows) move from their derived state to `next`. Pairs whose
 * deciding functions didn't change are skipped, so nothing else is touched.
 */
export function pairChanges(rows: PermRow[], next: FnState): RowChange[] {
  const before = deriveState(rows)
  const dirty = new Set(changedFns(before, next))
  if (dirty.size === 0) return []
  const current = toScopeMap(rows)
  const out: RowChange[] = []
  for (const o of OWNED) {
    if (!o.from.some((f) => dirty.has(f))) continue
    const cur = current.get(pair(o.m, o.a)) ?? null
    const want = o.value(next, cur)
    if (want !== cur) out.push({ module_key: o.m, action: o.a, scope: want })
  }
  return out
}

/** Role edits → set_role_permissions rows (null removes). */
export function roleChanges(roleRows: PermRow[], next: FnState): RowChange[] {
  return pairChanges(roleRows, next)
}

export interface OverrideChange {
  module_key: string
  action: Action
  scope: DbScope | 'inherit'
  note?: string | null
  expires_at?: string | null
}

/**
 * Person edits → set_user_overrides rows. A pair that ends up matching the
 * role is 'inherit' (override removed); anything else is an override, with
 * 'deny' where the person should lose what the role gives.
 */
export function personChanges(
  roleRows: PermRow[],
  effectiveRows: PermRow[],
  next: FnState,
  meta: Partial<Record<FnKey, { note?: string | null; expires_at?: string | null }>> = {}
): OverrideChange[] {
  const role = toScopeMap(roleRows)
  const changes = pairChanges(effectiveRows, next)
  return changes.map((c) => {
    const roleScope = role.get(pair(c.module_key, c.action)) ?? null
    const fn = OWNED.find((o) => o.m === c.module_key && o.a === c.action)!.from.find((f) => meta[f]) as FnKey | undefined
    const extra = fn ? meta[fn] : undefined
    if (c.scope === roleScope) return { module_key: c.module_key, action: c.action, scope: 'inherit' as const }
    return { module_key: c.module_key, action: c.action, scope: c.scope ?? 'deny', note: extra?.note ?? null, expires_at: extra?.expires_at ?? null }
  })
}

/** Where each function's effective grant comes from for a person. */
export function grantSources(roleRows: PermRow[], effectiveRows: PermRow[]): Record<FnKey, 'role' | 'person'> {
  const fromRole = deriveState(roleRows)
  const eff = deriveState(effectiveRows)
  return Object.fromEntries(FNS.map((f) => [f.key, sameGrant(fromRole[f.key], eff[f.key]) ? 'role' : 'person'])) as Record<FnKey, 'role' | 'person'>
}

export function describeGrant(fn: FnMeta, grant: Grant): string {
  if (!grant) return 'Not allowed'
  if (!grant.scope || !fn.scopes || fn.scopes.length <= 1) return 'Allowed'
  return `Allowed · ${SCOPE_LABEL[grant.scope]}`
}

/** Rows after applying changes (null scope removes) -- used to preview what a save will produce. */
export function applyChanges(rows: PermRow[], changes: RowChange[]): PermRow[] {
  const byPair = new Map<PairKey, PermRow>(rows.map((r) => [pair(r.module_key, r.action), r]))
  for (const c of changes) {
    const k = pair(c.module_key, c.action)
    if (c.scope === null) byPair.delete(k)
    else byPair.set(k, { module_key: c.module_key, action: c.action, scope: c.scope })
  }
  return [...byPair.values()]
}

/**
 * Grants another function implies: clocking in needs to see your own
 * attendance, so View attendance is at least Self whenever Clock in / out
 * is on (attendance.view own is what clocking writes).
 */
export function normalize(state: FnState): FnState {
  if (state.clock && !state.att_view) return { ...state, att_view: { scope: 'own' } }
  return state
}

/** Whether a function's switch is held on by another one (see normalize). */
export function heldOnBy(fn: FnKey, state: FnState): FnKey | null {
  if (fn === 'att_view' && state.clock && state.att_view?.scope === 'own') return 'clock'
  return null
}

/** The owned (module, action) pairs a function decides, alone or with others. */
export function fnPairs(fn: FnKey): { module_key: string; action: Action }[] {
  return OWNED.filter((o) => o.from.includes(fn)).map((o) => ({ module_key: o.m, action: o.a }))
}

/**
 * Overrides whose note or end date changed while their value didn't --
 * personChanges skips those pairs, so re-send them with the new details.
 */
export function detailChanges(
  overrides: (PermRow & { note?: string | null; expires_at?: string | null })[],
  fns: FnKey[],
  meta: Partial<Record<FnKey, { note?: string | null; expires_at?: string | null }>>,
  already: OverrideChange[]
): OverrideChange[] {
  const out: OverrideChange[] = []
  const seen = new Set(already.map((c) => pair(c.module_key, c.action)))
  for (const fn of fns) {
    const m = meta[fn]
    if (!m) continue
    for (const p of fnPairs(fn)) {
      const k = pair(p.module_key, p.action)
      const o = overrides.find((r) => pair(r.module_key, r.action) === k)
      if (!o || seen.has(k)) continue
      if ((o.note ?? null) === (m.note ?? null) && (o.expires_at ?? null) === (m.expires_at ?? null)) continue
      seen.add(k)
      out.push({ module_key: o.module_key, action: o.action, scope: o.scope, note: m.note ?? null, expires_at: m.expires_at ?? null })
    }
  }
  return out
}

const TZ_OFFSET = '+07:00' // Asia/Phnom_Penh, no DST

/** An "until" day (YYYY-MM-DD, inclusive) → the instant the override lapses: the next midnight in Phnom Penh. */
export function untilToExpiry(day: string): string {
  const next = new Date(`${day}T00:00:00${TZ_OFFSET}`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

/** The inverse of untilToExpiry: the last day an override still applies. */
export function expiryToUntil(expiresAt: string): string {
  const last = new Date(new Date(expiresAt).getTime() - 1 + 7 * 3600_000)
  return last.toISOString().slice(0, 10)
}

export interface WhoRole<R> {
  role: R
  grant: Grant
  people: number
}

export interface WhoException<P> {
  person: P
  grant: Grant
  roleGrant: Grant
  note: string | null
  expires_at: string | null
}

/** "Who can…": each role's grant for a function, and the people whose overrides differ from their role. */
export function whoCan<R extends { id: string }, P extends { id: string; role_id: string | null }>(
  fn: FnKey,
  roles: R[],
  people: P[],
  rolePerms: (PermRow & { role_id: string })[],
  overrides: (PermRow & { user_id: string; note?: string | null; expires_at?: string | null })[],
  now: Date = new Date()
): { roles: WhoRole<R>[]; exceptions: WhoException<P>[]; allowedPeople: number } {
  const rowsFor = (roleId: string | null) => rolePerms.filter((r) => r.role_id === roleId)
  const roleGrant = new Map(roles.map((r) => [r.id, deriveState(rowsFor(r.id))[fn]]))
  const pairs = new Set(fnPairs(fn).map((p) => pair(p.module_key, p.action)))
  const exceptions: WhoException<P>[] = []
  let allowedPeople = 0
  for (const p of people) {
    const base = p.role_id ? (roleGrant.get(p.role_id) ?? null) : null
    const mine = overrides.filter((o) => o.user_id === p.id)
    const grant = mine.length ? deriveState(mergeOverrides(rowsFor(p.role_id), mine, now))[fn] : base
    if (grant) allowedPeople++
    if (!sameGrant(grant, base)) {
      const o = mine.find((r) => pairs.has(pair(r.module_key, r.action)) && (!r.expires_at || new Date(r.expires_at) > now))
      exceptions.push({ person: p, grant, roleGrant: base, note: o?.note ?? null, expires_at: o?.expires_at ?? null })
    }
  }
  const out = roles.map((r) => ({ role: r, grant: roleGrant.get(r.id) ?? null, people: people.filter((p) => p.role_id === r.id).length }))
  out.sort((a, b) => Number(!!b.grant) - Number(!!a.grant))
  return { roles: out, exceptions, allowedPeople }
}
