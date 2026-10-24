import { Building2, LayoutGrid, RefreshCw, Settings, Users, type LucideIcon } from 'lucide-react'

export interface Section {
  path: string
  label: string
  description: string
  icon: LucideIcon
  /** The screens that land here (built in later phases). */
  planned: string[]
}

export const SECTIONS: Section[] = [
  {
    path: '/users',
    label: 'User management',
    description: 'People, roles and permissions',
    icon: Users,
    planned: ['Users list, create / edit / deactivate', 'Roles and per-person permission overrides', 'Org structure and reporting lines'],
  },
  {
    path: '/sync',
    label: 'Data sync',
    description: 'Sheet syncs feeding the app',
    icon: RefreshCw,
    planned: ['Sync list with last-run counts', 'Preview and Sync now', 'Run history and sync setup'],
  },
  {
    path: '/company',
    label: 'Company settings',
    description: 'Working hours, attendance, geofence',
    icon: Building2,
    planned: ['Working hours and clock rules', 'Attendance cycle, leave allowances, holidays', 'Geofence, work locations and trip settings'],
  },
  {
    path: '/system',
    label: 'System settings',
    description: 'Global defaults and notifications',
    icon: Settings,
    planned: ['Global app settings', 'Telegram and Web Push notification channels', 'Translations'],
  },
  {
    path: '/components',
    label: 'Components',
    description: 'Built components, light and dark',
    icon: LayoutGrid,
    planned: [],
  },
]
