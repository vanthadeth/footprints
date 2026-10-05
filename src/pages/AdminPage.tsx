import { AdminGroup, AdminRow } from '@/components/AdminKit'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { adminRows } from '@/features/nav/navConfig'

/** Admin (tab for System Admin / Super Admin): every administration screen the person can use, in one list. */
export function AdminPage() {
  const { ctx } = useRoleGroup()
  const { unreadCount } = useNotificationsContext()
  const rows = adminRows(ctx)
  // Sections as on the design canvas (Polish › Admin); anything new lands in System.
  const SECTIONS: [string, string[]][] = [
    ['People & access', ['users', 'permissions']],
    ['Time & attendance', ['hours', 'adminatt', 'locations']],
    ['Data', ['sheetsync']],
  ]
  const placed = new Set(SECTIONS.flatMap(([, keys]) => keys))
  const groups = [...SECTIONS.map(([title, keys]) => [title, rows.filter((r) => keys.includes(r.key))] as const), ['System', rows.filter((r) => !placed.has(r.key))] as const].filter(([, list]) => list.length > 0)
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-[18px] px-4 pb-8 pt-1 md:max-w-2xl md:px-8">
      <p className="-mb-2 text-[14px] text-neutral-500">People, access and company settings</p>
      {groups.map(([title, list]) => (
        <AdminGroup key={title} title={title}>
          {list.map((r) => (
            <AdminRow
              key={r.key}
              icon={r.icon}
              label={r.label}
              sub={r.sub}
              to={r.to}
              pill={r.key === 'notifications' && unreadCount > 0 ? { text: String(unreadCount), tone: 'danger' } : undefined}
            />
          ))}
        </AdminGroup>
      ))}
    </div>
  )
}
