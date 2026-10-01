import { describe, expect, it } from 'vitest'
import { adminRows, fnForPath, forYou, homeFor, hubFunctions, hubSearch, roleGroup, tabsFor, type NavContext } from '../navConfig'
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
  const keys = (fns: ReturnType<typeof hubFunctions>) => fns.flatMap((f) => f.rows.map((r) => r.key))

  it('groups a salesperson into Customers & sales, My day and Leave, without tabs or rows they cannot use', () => {
    const fns = hubFunctions('field', ctx(SALES))
    expect(fns.map((f) => f.key)).toEqual(['sell', 'day', 'time'])
    expect(keys(fns)).toContain('plan')
    expect(keys(fns)).not.toContain('daysoff')
    expect(keys(fns)).not.toContain('calendar')
    expect(keys(fns)).not.toContain('messages')
    expect(keys(hubFunctions('field', ctx(SALES, false, true)))).toContain('daysoff')
  })

  it('gives admins all five functions with Company setup first, split into parts', () => {
    const fns = hubFunctions('admin', ctx([], true))
    expect(fns.map((f) => f.key)).toEqual(['company', 'team', 'time', 'sell', 'day'])
    const company = fns[0]
    expect(company.rows).toHaveLength(9)
    expect(company.parts.map((p) => p.title)).toEqual(['People & access', 'Work rules', 'System'])
    expect(fns.find((f) => f.key === 'time')?.parts.map((p) => p.key)).toEqual(['mine', 'team', 'company'])
  })

  it('drops functions with nothing in them', () => {
    expect(hubFunctions('manager', ctx(MANAGER)).map((f) => f.key)).not.toContain('company')
  })

  it('finds screens by name or description, with their function', () => {
    const found = hubSearch('admin', ctx([], true), 'leave')
    expect(found.map((r) => r.key)).toEqual(expect.arrayContaining(['leave', 'allowances']))
    expect(found.find((r) => r.key === 'allowances')?.fn.key).toBe('time')
    expect(hubSearch('admin', ctx([], true), '  ')).toEqual([])
    expect(fnForPath('/settings/trips')).toBe('company')
    expect(fnForPath('/check-in')).toBeUndefined()
  })

  it('shows HR the HR tools and admins everything in Administration', () => {
    expect(forYou('hr', ctx(HR)).map((r) => r.key)).toEqual(['allowances', 'holidays', 'flexteam', 'attendance'])
    expect(adminRows(ctx([], true))).toHaveLength(11)
    expect(adminRows(ctx(MANAGER))).toHaveLength(0)
  })
})
