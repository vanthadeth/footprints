import { describe, expect, it } from 'vitest'
import { adminRows, forYou, homeFor, hubSections, roleGroup, tabsFor, type NavContext } from '../navConfig'
import type { Scope } from '@/features/permissions/catalog'

/** A context from "module.action=scope" strings, like the role_permissions rows. */
function ctx(perms: string[], isSuperAdmin = false, flexible = false): NavContext {
  const map = new Map(perms.map((p) => p.split('=') as [string, Scope]))
  return { isSuperAdmin, flexible, scope: (m, a) => map.get(`${m}.${a}`) ?? null }
}

const SALES = ['plan.view=own', 'footprints.view=own', 'visit.add=own', 'customer.view=any', 'customer_conversation.view=any', 'leave.view=own', 'leave.edit=own']
const MANAGER = ['team_map.view=sub', 'leave.edit=sub', 'leave.view=sub', 'leave_balance.view=sub', 'customer_briefing.view=any', 'plan.view=own', 'footprints.view=own']
const HR = ['team_map.view=any', 'leave.view=any', 'leave.edit=any', 'leave_balance.view=any', 'leave_balance.edit=any', 'attendance.view=any']
const ACCOUNTING = ['team_map.view=any', 'attendance.view=any', 'customer.view=any', 'leave.view=own', 'leave.edit=own']
const WAREHOUSE = ['plan.view=own', 'footprints.view=own', 'customer.view=any', 'leave.view=own']

describe('roleGroup', () => {
  it('puts each live role in its group', () => {
    expect(roleGroup(ctx(SALES))).toBe('field')
    expect(roleGroup(ctx(WAREHOUSE))).toBe('field')
    expect(roleGroup(ctx(MANAGER))).toBe('manager')
    expect(roleGroup(ctx(HR))).toBe('hr')
    expect(roleGroup(ctx(ACCOUNTING))).toBe('office')
    expect(roleGroup(ctx([], true))).toBe('admin')
    expect(roleGroup(ctx(['role_permission.edit=any']))).toBe('admin')
  })

  it('treats an unknown role with no field or team rights as office', () => {
    expect(roleGroup(ctx(['customer.view=own']))).toBe('office')
  })
})

describe('tabs', () => {
  it('gives salespeople Calendar, Messages, Check In, Briefing and Hub once they can see the briefing', () => {
    expect(tabsFor('field', ctx(SALES)).map((t) => t.key)).toEqual(['calendar', 'messages', 'checkin', 'hub'])
    expect(tabsFor('field', ctx([...SALES, 'customer_briefing.view=any'])).map((t) => t.key)).toEqual(['calendar', 'messages', 'checkin', 'briefing', 'hub'])
    expect(homeFor('field', ctx(SALES))).toBe('/check-in')
  })

  it('gives managers Team and Approvals', () => {
    expect(tabsFor('manager', ctx(MANAGER)).map((t) => t.key)).toEqual(['team', 'customers', 'checkin', 'approvals', 'hub'])
    expect(homeFor('manager', ctx(MANAGER))).toBe('/team')
  })
})

describe('hub', () => {
  it('hides rows a person cannot use and anything already a tab', () => {
    const rows = hubSections('field', ctx(SALES)).flatMap((s) => s.rows.map((r) => r.key))
    expect(rows).toContain('plan')
    expect(rows).not.toContain('daysoff')
    expect(rows).not.toContain('calendar')
    expect(hubSections('field', ctx(SALES, false, true)).flatMap((s) => s.rows.map((r) => r.key))).toContain('daysoff')
  })

  it('shows HR the HR tools and admins everything in Administration', () => {
    expect(forYou('hr', ctx(HR)).map((r) => r.key)).toEqual(['allowances', 'holidays', 'flexteam', 'attendance'])
    expect(adminRows(ctx([], true))).toHaveLength(11)
    expect(adminRows(ctx(MANAGER))).toHaveLength(0)
  })
})
