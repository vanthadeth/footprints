import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useMessages } from '@/features/conversations/MessagesContext'
import { haptic } from '@/lib/haptic'

/**
 * Title-bar shortcut into Messages -- the customer conversations that
 * concern you (mentions, replies, your customers, follow-ups due), for
 * every signed-in user. Reads the shared MessagesProvider (AppLayout) so
 * the badge and the Messages page share one realtime subscription.
 * Super admins still reach the activity Notifications from Hub.
 */
export function NotificationBell() {
  const { unreadCount } = useMessages()
  const navigate = useNavigate()

  return (
    <button
      onClick={() => {
        haptic('light')
        navigate('/messages')
      }}
      aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'}
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
