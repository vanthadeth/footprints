import { GroupedList, ListRow } from '@/components/GroupedList'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { adminRows } from '@/features/nav/navConfig'

/** Admin (tab for System Admin / Super Admin): every administration screen the person can use, in one list. */
export function AdminPage() {
  const { ctx } = useRoleGroup()
  const { unreadCount } = useNotificationsContext()
  const rows = adminRows(ctx)
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-1 md:max-w-2xl md:px-8">
      <p className="text-[14px] text-neutral-600">People, access and company settings</p>
      <GroupedList title="Administration">
        {rows.map((r) => (
          <ListRow key={r.key} icon={r.icon} iconBg={r.tone} label={r.label} sublabel={r.sub} to={r.to} badge={r.key === 'notifications' ? unreadCount : undefined} />
        ))}
      </GroupedList>
    </div>
  )
}
