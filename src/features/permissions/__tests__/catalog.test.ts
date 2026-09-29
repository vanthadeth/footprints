import { describe, expect, it } from 'vitest'
import {
  FNS,
  FN_BY_KEY,
  applyChanges,
  deriveState,
  describeGrant,
  detailChanges,
  expiryToUntil,
  heldOnBy,
  normalize,
  untilToExpiry,
  whoCan,
  grantSources,
  mergeOverrides,
  personChanges,
  roleChanges,
  type Action,
  type DbScope,
  type FnState,
  type PermRow,
} from '../catalog'
import { clockBlock } from '../clockRules'

const rows = (spec: string): PermRow[] =>
  spec
    .trim()
    .split(/\s+/)
    .map((t) => {
      const [m, a, s] = t.split(':')
      return { module_key: m, action: a as Action, scope: s as DbScope }
    })

// Live role rows (Sept 2026) for the catalogue's modules plus a few it must never touch.
const SALES = rows(`
  attendance:view:own attendance:add:own attendance:edit:own customer:view:any customer:add:own customer:edit:own
  customer_conversation:view:any customer_conversation:add:own footprints:view:own invoice:view:sub leave:view:own
  leave:add:own leave:edit:own leave_balance:view:own plan:view:own sale_order:view:sub user:view:any
  visit:view:own visit:add:own visit:edit:own`)
const MANAGER = rows(`
  attendance:view:sub attendance:add:own attendance:edit:own customer:view:any customer:add:own customer:edit:any
  customer_conversation:view:any customer_conversation:add:any footprints:view:own leave:view:sub leave:add:own
  leave:edit:sub plan:view:own team_map:view:any visit:view:sub visit:add:own visit:edit:own visit_quota:edit:sub`)
const HR = rows(`
  attendance:view:own attendance:add:own attendance:edit:own customer_conversation:view:any leave:view:any leave:add:own
  leave:edit:any leave_balance:view:any leave_balance:edit:any team_map:view:any user:view:any user:add:any user:edit:any
  visit:view:own visit:add:own visit:edit:own`)
const SYSADMIN = rows(`
  attendance:view:any attendance:add:any attendance:edit:any attendance:delete:any customer:view:any customer:add:any
  customer:edit:any customer_conversation:view:any customer_conversation:add:any footprints:view:own leave:view:any
  leave:add:any leave:edit:any leave_balance:edit:any plan:view:own settings:edit:any team_map:view:any user:add:any
  user:edit:any visit:add:any visit:edit:any role_permission:edit:any`)

const edit = (r: PermRow[], patch: Partial<FnState>): FnState => ({ ...deriveState(r), ...patch })

describe('deriveState', () => {
  it('reads the design functions from a role', () => {
    const s = deriveState(SALES)
    expect(s.footprints).toEqual({ scope: null })
    expect(s.clock).toEqual({ scope: null })
    expect(s.att_view).toEqual({ scope: 'own' })
    expect(s.att_override).toBeNull() // attendance.edit own is just clocking out
    expect(s.customer_call).toEqual({ scope: 'own' })
    expect(s.team_map).toBeNull()
    expect(s.leave_approve).toBeNull() // leave.edit own is just cancelling your own
    expect(s.users).toBeNull()
  })

  it('treats deny like no access', () => {
    expect(deriveState(rows('footprints:view:deny')).footprints).toBeNull()
  })

  it('has a label for all 16 functions', () => {
    expect(FNS).toHaveLength(16)
  })
})

describe('roleChanges', () => {
  it('writes nothing when nothing changed, for every seeded role', () => {
    for (const r of [SALES, MANAGER, HR, SYSADMIN]) expect(roleChanges(r, deriveState(r))).toEqual([])
  })

  it('only touches the pairs of the function that changed', () => {
    expect(roleChanges(SALES, edit(SALES, { team_map: { scope: 'sub' } }))).toEqual([
      { module_key: 'team_map', action: 'view', scope: 'sub' },
    ])
    expect(roleChanges(SALES, edit(SALES, { footprints: null }))).toEqual([
      { module_key: 'footprints', action: 'view', scope: null },
    ])
  })

  it('keeps wider scopes on on/off functions it does not change', () => {
    // System Admin clocks for anyone (attendance.add any); toggling Footprints leaves that alone.
    const out = roleChanges(SYSADMIN, edit(SYSADMIN, { footprints: null }))
    expect(out).toEqual([{ module_key: 'footprints', action: 'view', scope: null }])
  })

  it('moves add and edit together for Add / edit customers', () => {
    expect(roleChanges(MANAGER, edit(MANAGER, { customer_edit: { scope: 'sub' } }))).toEqual([
      { module_key: 'customer', action: 'add', scope: 'sub' },
      { module_key: 'customer', action: 'edit', scope: 'sub' },
    ])
  })

  it('keeps own attendance when correcting attendance is switched off', () => {
    const out = roleChanges(SYSADMIN, edit(SYSADMIN, { att_override: null }))
    expect(out).toEqual([{ module_key: 'attendance', action: 'edit', scope: 'own' }])
  })

  it('drops all own attendance rows when clocking is switched off', () => {
    const out = roleChanges(SALES, edit(SALES, { clock: null, att_view: null }))
    expect(out).toEqual([
      { module_key: 'attendance', action: 'add', scope: null },
      { module_key: 'attendance', action: 'view', scope: null },
      { module_key: 'attendance', action: 'edit', scope: null },
    ])
  })

  it('keeps a wider view when clocking is switched off', () => {
    const out = roleChanges(MANAGER, edit(MANAGER, { clock: null }))
    expect(out).toEqual([
      { module_key: 'attendance', action: 'add', scope: null },
      { module_key: 'attendance', action: 'edit', scope: null },
    ])
  })

  it('falls back to own leave when approving is switched off', () => {
    const out = roleChanges(HR, edit(HR, { leave_approve: null }))
    expect(out).toEqual([
      { module_key: 'leave', action: 'view', scope: 'own' },
      { module_key: 'leave', action: 'edit', scope: 'own' },
    ])
    expect(deriveState(applyChanges(HR, out)).leave_request).toEqual({ scope: null })
  })

  it('grants approvals to a role that only requested leave', () => {
    const out = roleChanges(SALES, edit(SALES, { leave_approve: { scope: 'sub' } }))
    expect(out).toEqual([
      { module_key: 'leave', action: 'view', scope: 'sub' },
      { module_key: 'leave', action: 'edit', scope: 'sub' },
    ])
  })

  it('round-trips: the saved rows derive back to the edited state', () => {
    const next = edit(SALES, { team_map: { scope: 'sub' }, plan: null, customer_edit: { scope: 'any' } })
    expect(deriveState(applyChanges(SALES, roleChanges(SALES, next)))).toEqual(next)
  })

  it('never touches pairs outside the catalogue', () => {
    const next = edit(MANAGER, Object.fromEntries(FNS.map((f) => [f.key, null])) as Partial<FnState>)
    const after = applyChanges(MANAGER, roleChanges(MANAGER, next))
    expect(after).toEqual(expect.arrayContaining(rows('visit:view:sub visit_quota:edit:sub')))
  })
})

describe('person overrides', () => {
  const now = new Date('2026-09-29T00:00:00Z')

  it('ignores expired overrides', () => {
    const eff = mergeOverrides(
      SALES,
      [
        { module_key: 'team_map', action: 'view', scope: 'sub', expires_at: '2026-09-01T00:00:00Z' },
        { module_key: 'plan', action: 'view', scope: 'deny', expires_at: '2026-10-01T00:00:00Z' },
      ],
      now
    )
    const s = deriveState(eff)
    expect(s.team_map).toBeNull()
    expect(s.plan).toBeNull()
  })

  it('denies what the role gives, with note and expiry', () => {
    const out = personChanges(SALES, SALES, edit(SALES, { plan: null }), {
      plan: { note: 'Office week', expires_at: '2026-10-05T00:00:00Z' },
    })
    expect(out).toEqual([
      { module_key: 'plan', action: 'view', scope: 'deny', note: 'Office week', expires_at: '2026-10-05T00:00:00Z' },
    ])
  })

  it('allows beyond the role', () => {
    const out = personChanges(SALES, SALES, edit(SALES, { team_map: { scope: 'sub' } }))
    expect(out).toEqual([{ module_key: 'team_map', action: 'view', scope: 'sub', note: null, expires_at: null }])
  })

  it('goes back to the role when the value matches it again', () => {
    const eff = mergeOverrides(SALES, [{ module_key: 'plan', action: 'view', scope: 'deny' }], now)
    expect(grantSources(SALES, eff).plan).toBe('person')
    const out = personChanges(SALES, eff, edit(eff, { plan: { scope: null } }))
    expect(out).toEqual([{ module_key: 'plan', action: 'view', scope: 'inherit' }])
  })
})

describe('describeGrant', () => {
  it('labels scopes only where there is a choice', () => {
    expect(describeGrant(FN_BY_KEY.customer_view, { scope: 'sub' })).toBe('Allowed · Team')
    expect(describeGrant(FN_BY_KEY.settings, { scope: 'any' })).toBe('Allowed')
    expect(describeGrant(FN_BY_KEY.footprints, null)).toBe('Not allowed')
  })
})

describe('clock location rules', () => {
  const office = { id: 'o', name: 'Office', latitude: 11.5564, longitude: 104.9282, radius_m: 50 }
  const warehouse = { id: 'w', name: 'Warehouse', latitude: 11.6, longitude: 104.9282, radius_m: 100 }

  it('passes anywhere when there is no rule', () => {
    expect(clockBlock([], { latitude: 0, longitude: 0 })).toBeNull()
  })

  it('passes inside any required location', () => {
    expect(clockBlock([office, warehouse], { latitude: 11.5566, longitude: 104.9282 })).toBeNull()
  })

  it('names the places and the nearest one when outside them all', () => {
    expect(clockBlock([warehouse, office], { latitude: 11.5664, longitude: 104.9282 })).toEqual({
      names: 'Office or Warehouse',
      nearest: 'Office',
      distance: '1.1 km',
    })
  })
})

describe('implied grants', () => {
  it('keeps View attendance at Self while clocking is on', () => {
    const s = normalize({ ...deriveState(SALES), att_view: null })
    expect(s.att_view).toEqual({ scope: 'own' })
    expect(heldOnBy('att_view', s)).toBe('clock')
    expect(heldOnBy('att_view', { ...s, att_view: { scope: 'sub' } })).toBeNull()
  })
})

describe('override details', () => {
  it('re-sends an override whose note or end date changed', () => {
    const ov = [{ module_key: 'team_map', action: 'view' as const, scope: 'sub' as const, note: 'a', expires_at: null }]
    expect(detailChanges(ov, ['team_map'], { team_map: { note: 'a', expires_at: null } }, [])).toEqual([])
    expect(detailChanges(ov, ['team_map'], { team_map: { note: 'b', expires_at: null } }, [])).toEqual([
      { module_key: 'team_map', action: 'view', scope: 'sub', note: 'b', expires_at: null },
    ])
  })

  it('turns an until day into the next Phnom Penh midnight and back', () => {
    expect(untilToExpiry('2026-10-15')).toBe('2026-10-15T17:00:00.000Z')
    expect(expiryToUntil('2026-10-15T17:00:00.000Z')).toBe('2026-10-15')
  })
})

describe('whoCan', () => {
  const roles = [
    { id: 'sales', name: 'Sales' },
    { id: 'hr', name: 'HR' },
  ]
  const perms = [...SALES.map((r) => ({ ...r, role_id: 'sales' })), ...HR.map((r) => ({ ...r, role_id: 'hr' }))]
  const people = [
    { id: 'a', role_id: 'sales' },
    { id: 'b', role_id: 'sales' },
    { id: 'c', role_id: 'hr' },
  ]

  it('lists allowed roles first and counts people', () => {
    const w = whoCan('leave_approve', roles, people, perms, [])
    expect(w.roles.map((r) => [r.role.id, r.grant, r.people])).toEqual([
      ['hr', { scope: 'any' }, 1],
      ['sales', null, 2],
    ])
    expect(w.allowedPeople).toBe(1)
    expect(w.exceptions).toEqual([])
  })

  it('shows people whose overrides differ from their role', () => {
    const w = whoCan('team_map', roles, people, perms, [
      { user_id: 'a', module_key: 'team_map', action: 'view', scope: 'sub', note: 'Cover', expires_at: null },
      { user_id: 'c', module_key: 'team_map', action: 'view', scope: 'deny', note: null, expires_at: null },
    ])
    expect(w.exceptions.map((e) => [e.person.id, e.grant, e.roleGrant, e.note])).toEqual([
      ['a', { scope: 'sub' }, null, 'Cover'],
      ['c', null, { scope: 'any' }, null],
    ])
    expect(w.allowedPeople).toBe(1)
  })
})
