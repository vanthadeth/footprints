import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { dateLine, greeting, initialsOf, unreadCount, type NotificationItem } from '../appBar'
import { AppBar } from '../AppBar'

const items: NotificationItem[] = [
  { id: '1', kind: 'alert', title: 'Invoice overdue · Lucky Mart', detail: '$480 unpaid for 14 days', time: '9:12', unread: true },
  { id: '2', kind: 'announcement', title: 'Manager · Mr. Vireak', detail: 'New promo starts Monday', time: '8:40', unread: true },
  { id: '3', kind: 'approved', title: 'Leave approved', detail: 'Annual leave 2 Nov, full day', time: 'Tue' },
]

describe('helpers', () => {
  it('writes the date line, the greeting and the initials', () => {
    expect(dateLine('2026-10-23')).toBe('Friday 23 Oct') // 23 Oct 2026 is a Friday
    expect(dateLine('2026-10-22')).toBe('Thursday 22 Oct')
    expect(greeting(8, 'Dara')).toBe('Good morning, Dara')
    expect(greeting(12, 'Dara')).toBe('Good afternoon, Dara')
    expect(greeting(18, 'Dara')).toBe('Good evening, Dara')
    expect(initialsOf('Dara Sok')).toBe('DS')
    expect(initialsOf('  sok   heng  minimart ')).toBe('SM')
    expect(initialsOf('Dara')).toBe('D')
    expect(initialsOf('')).toBe('')
  })
  it('counts unread notifications', () => {
    expect(unreadCount(items)).toBe(2)
    expect(unreadCount([])).toBe(0)
  })
})

describe('<AppBar> tab screen', () => {
  const html = renderToStaticMarkup(<AppBar title="Calendar" dateLine="Friday 23 Oct" initials="DS" notifications={items} />)
  it('shows the date line, the large title, the bell with the unread count and the profile circle', () => {
    expect(html).toContain('Friday 23 Oct')
    expect(html).toContain('<h1 class="ab-h1">Calendar</h1>')
    expect(html).toContain('aria-label="Notifications, 2 unread"')
    expect(html).toContain('<i class="ab-bd">2</i>')
    expect(html).toContain('>DS<')
  })
  it('has no panels until opened, and no offline strip', () => {
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('ab-off')
  })
  it('shows no badge when nothing is unread', () => {
    expect(renderToStaticMarkup(<AppBar title="Calendar" dateLine="x" notifications={[]} />)).not.toContain('ab-bd')
  })
  it('compacts to a bar with a smaller title and no large heading', () => {
    const c = renderToStaticMarkup(<AppBar title="Calendar" dateLine="x" compact />)
    expect(c).toContain('ab-cmp')
    expect(c).toContain('ab-ct2')
    expect(c).not.toContain('<h1')
  })
  it('shows the offline strip above the bar', () => {
    const o = renderToStaticMarkup(<AppBar title="Calendar" dateLine="x" offline />)
    expect(o.indexOf('Offline · changes will sync')).toBeLessThan(o.indexOf('<header'))
  })
})

describe('<AppBar> sub screen', () => {
  it('has a back button, a title with a line under it, and one action but no profile circle', () => {
    const html = renderToStaticMarkup(<AppBar variant="sub" title="Sok Heng Minimart" subtitle="Toul Kork" action={{ kind: 'more', label: 'More', onClick: () => {} }} />)
    expect(html).toContain('aria-label="Back"')
    expect(html).toContain('<b>Sok Heng Minimart</b>')
    expect(html).toContain('Toul Kork')
    expect(html).toContain('aria-label="More"')
    expect(html).not.toContain('ab-av')
    expect(html).not.toContain('<h1')
  })
  it('omits the action when none is given', () => {
    expect(renderToStaticMarkup(<AppBar variant="sub" title="Customers" />)).not.toContain('ab-acts')
  })
})

describe('<AppBar> panels', () => {
  it('opens the notifications sheet with the items, Mark all read and See all', () => {
    const html = renderToStaticMarkup(<AppBar title="Calendar" dateLine="x" notifications={items} defaultOpen="notifications" overlay="absolute" />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('ab-absolute')
    expect(html).toContain('Mark all read')
    expect(html).toContain('Invoice overdue · Lucky Mart')
    expect(html).toContain('See all notifications')
    expect(html.match(/class="ab-un"/g)).toHaveLength(2)
  })
  it('opens the profile menu with the person, the two switches and Log out', () => {
    const html = renderToStaticMarkup(
      <AppBar title="Calendar" dateLine="x" initials="DS" profile={{ name: 'Dara Sok', role: 'Salesperson' }} preferences={{ khmer: false, dark: true }} defaultOpen="profile" />,
    )
    expect(html).toContain('role="menu"')
    expect(html).toContain('Dara Sok')
    expect(html).toContain('Salesperson · View profile')
    expect(html).toMatch(/aria-checked="false"[^>]*>(?:(?!<button).)*Khmer language/)
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<button).)*Dark mode/)
    expect(html).toContain('Log out')
  })
})
