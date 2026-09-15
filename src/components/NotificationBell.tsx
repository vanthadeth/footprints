import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useNotifications } from '@/features/notifications/useNotifications'
import { haptic } from '@/lib/haptic'

/**
 * Title-bar shortcut into the Notifications Center -- rendered for every
 * authenticated screen (like ProfileBadge), but only ever visible to a
 * super admin, since that's the whole feature's audience (see
 * NotificationsPage). `useNotifications(isSuperAdmin)` skips its fetch +
 * realtime subscription entirely for everyone else.
 */
export function NotificationBell() {
  const { profile } = useProfile()
  const isSuperAdmin = profile?.is_super_admin === true
  const { unreadCount } = useNotifications(isSuperAdmin)
  const navigate = useNavigate()

  if (!isSuperAdmin) return null

  return (
    <button
      onClick={() => {
        haptic('light')
        navigate('/notifications')
      }}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 tap-target dark:text-neutral-300"
    >
      <Bell className="h-5 w-5" aria-hidden />
      {unreadCount > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[9px] font-bold leading-none text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}
