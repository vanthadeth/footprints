import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { badgeText, SHORTCUT_OPTIONS, tabsForRole } from '../bottomNav'
import { BottomNav } from '../BottomNav'

describe('badgeText', () => {
  it('shows nothing for zero, the count up to 99 and 99+ above', () => {
    expect(badgeText(undefined)).toBe('')
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })
})

describe('tabsForRole', () => {
  it('gives a salesperson Calendar, Messages, Briefing and Menu, with the messages badge', () => {
    const t = tabsForRole('salesperson', { messages: 3 })
    expect(t.map((x) => x.label)).toEqual(['Calendar', 'Messages', 'Briefing', 'Menu'])
    expect(t[1].badge).toBe(3)
  })
  it('lets the salesperson replace Briefing with a chosen shortcut', () => {
    expect(tabsForRole('salesperson', { shortcut: 'orders' })[2].label).toBe('Orders')
    expect(tabsForRole('salesperson', { shortcut: 'nonsense' })[2].label).toBe('Briefing')
  })
  it('gives a manager Team, Customers, Approvals and Menu, with the approvals badge and no shortcut', () => {
    const t = tabsForRole('manager', { approvals: 120, shortcut: 'orders' })
    expect(t.map((x) => x.label)).toEqual(['Team', 'Customers', 'Approvals', 'Menu'])
    expect(t[2].badge).toBe(120)
  })
  it('offers Briefing, Customers, Orders, Map and Reports as shortcuts', () => {
    expect(SHORTCUT_OPTIONS.map((o) => o.label)).toEqual(['Briefing', 'Customers', 'Orders', 'Map', 'Reports'])
  })
})

describe('<BottomNav>', () => {
  const tabs = tabsForRole('salesperson', { messages: 120 })
  it('puts Check In in the middle, with an accessible name and no label text', () => {
    const html = renderToStaticMarkup(<BottomNav tabs={tabs} active="calendar" />)
    const order = ['Calendar', 'Messages', 'aria-label="Check in"', 'Briefing', 'Menu'].map((s) => html.indexOf(s))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).not.toContain('>Check in<')
  })
  it('marks the open tab and shows a capped badge', () => {
    const html = renderToStaticMarkup(<BottomNav tabs={tabs} active="messages" />)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain('<i class="nav-bd">99+</i>')
  })
  it('is black before clock-in and shows the pin with a green dot once clocked in; open adds the ring', () => {
    const idle = renderToStaticMarkup(<BottomNav tabs={tabs} active="calendar" />)
    expect(idle).toContain('nav-idle')
    expect(idle).not.toContain('nav-live')
    const on = renderToStaticMarkup(<BottomNav tabs={tabs} active="checkin" clockedIn />)
    expect(on).not.toContain('nav-idle')
    expect(on).toContain('nav-live')
    expect(on).toContain('nav-fab nav-on')
    expect(on).toContain('aria-label="Check in, clocked in"')
  })
  it('opens the shortcut menu above the tab with the current choice checked', () => {
    const html = renderToStaticMarkup(<BottomNav tabs={tabs} active="calendar" shortcut={{ options: SHORTCUT_OPTIONS, onChange: () => {} }} defaultMenuOpen />)
    expect(html).toContain('role="menu"')
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(5)
    expect(html).toMatch(/aria-checked="true"[^>]*><span class="nav-mi">(?:(?!<\/button>).)*Briefing/)
    expect(html).toContain('Hold the tab to change it any time')
  })
  it('has no menu unless a shortcut is given or it is opened', () => {
    expect(renderToStaticMarkup(<BottomNav tabs={tabs} active="calendar" shortcut={{ options: SHORTCUT_OPTIONS, onChange: () => {} }} />)).not.toContain('role="menu"')
    expect(renderToStaticMarkup(<BottomNav tabs={tabs} active="calendar" />)).not.toContain('aria-haspopup')
  })
})
