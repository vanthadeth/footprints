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
/** The messages bell (canvas Polish › title bar): `framed` is the round card-style button on tab screens. */
export function NotificationBell({ framed = false }: { framed?: boolean }) {
  const { unreadCount } = useMessages()
  const navigate = useNavigate()

  return (
    <button
      onClick={() => {
        haptic('light')
        navigate('/messages')
      }}
      aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-600 tap-target dark:text-neutral-300 ${framed ? 'border border-neutral-100 bg-white shadow-card' : ''}`}
    >
      <Bell className="h-5 w-5" aria-hidden />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-neutral-50 bg-status-danger px-1 text-[10px] font-extrabold leading-none text-white dark:border-[#1c1c1c]">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}
