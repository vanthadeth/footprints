import { BarChart3, CalendarDays, CheckSquare, ClipboardList, Map, Menu, MessageSquare, Package, Store, Users, type LucideIcon } from 'lucide-react'

export interface NavTab {
  key: string
  label: string
  icon: LucideIcon
  /** Unread or pending count shown as a red badge on the icon. */
  badge?: number
}

export type NavRole = 'salesperson' | 'manager'

/** "" for nothing to show, the count up to 99, "99+" above that. */
export function badgeText(count: number | undefined): string {
  if (!count || count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

/** The tab after Check In (the 4th of the five) is chosen by the person from these. Briefing is the default. */
export const SHORTCUT_OPTIONS: NavTab[] = [
  { key: 'briefing', label: 'Briefing', icon: ClipboardList },
  { key: 'customers', label: 'Customers', icon: Store },
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'map', label: 'Map', icon: Map },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
]

/**
 * The four tabs around the Check In button, left pair then right pair.
 * Salesperson: Calendar, Messages, (Check In), Briefing, Menu.
 * Manager: Team, Customers, (Check In), Approvals, Menu.
 * `shortcut` replaces the salesperson's Briefing tab with the person's choice.
 */
export function tabsForRole(role: NavRole, opts: { messages?: number; approvals?: number; shortcut?: string } = {}): NavTab[] {
  const menu: NavTab = { key: 'menu', label: 'Menu', icon: Menu }
  if (role === 'manager') {
    return [
      { key: 'team', label: 'Team', icon: Users },
      { key: 'customers', label: 'Customers', icon: Store },
      { key: 'approvals', label: 'Approvals', icon: CheckSquare, badge: opts.approvals },
      menu,
    ]
  }
  const chosen = SHORTCUT_OPTIONS.find((o) => o.key === opts.shortcut) ?? SHORTCUT_OPTIONS[0]
  return [{ key: 'calendar', label: 'Calendar', icon: CalendarDays }, { key: 'messages', label: 'Messages', icon: MessageSquare, badge: opts.messages }, chosen, menu]
}

/** How long a press on the shortcut tab must last to open its menu. */
export const HOLD_MS = 500
