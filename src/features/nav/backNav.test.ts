import { describe, expect, it } from 'vitest'
import { appBack, parentPath } from './backNav'

const nav = { tabs: ['/team', '/customers', '/check-in', '/approvals', '/menu'], home: '/team' }

describe('appBack', () => {
  it('keeps the home tab and the sign-in screens where they are', () => {
    expect(appBack('/team', '', nav)).toBeNull()
    expect(appBack('/login', '', nav)).toBeNull()
    expect(appBack('/welcome', '', null)).toBeNull()
  })

  it('sends another tab to the home tab', () => {
    expect(appBack('/customers', '', nav)).toBe('/team')
    expect(appBack('/menu', '', nav)).toBe('/team')
  })

  it('sends a sub-page to its parent, the same as the title bar', () => {
    expect(appBack('/customers/abc', '', nav)).toBe('/customers')
    expect(appBack('/trips/calendar', '', nav)).toBe('/approvals?tab=trips')
    expect(appBack('/leave/days-off', '?user=u2', nav)).toBe('/leave/flexible')
    expect(appBack('/customers/abc', '', nav)).toBe(parentPath('/customers/abc'))
  })

  it('sends the password screens back to sign-in', () => {
    expect(appBack('/forgot-password', '', null)).toBe('/login')
    expect(appBack('/reset-password', '', null)).toBe('/login')
  })

  it('falls back to Hub parents before the tabs are known', () => {
    expect(appBack('/customers/abc', '', null)).toBe('/customers')
    expect(appBack('/admin/geofence', '', null)).toBe('/admin')
  })
})
