import { Bell } from 'lucide-react'
import { timeAgo } from '@/lib/datetime'
import { useLanguage } from '@/i18n/LanguageContext'
import { NOTIFICATION_KIND_META } from './notificationKindMeta'
import type { NotificationFeedRow } from './notificationsService'

/** One activity alert: who, what kind, what happened, at which customer, and when. `compact` is the one-line-shorter version for cards. */
export function NotificationRow({ notification: n, compact = false }: { notification: NotificationFeedRow; compact?: boolean }) {
  const { t, language } = useLanguage()
  const meta = n.kind ? NOTIFICATION_KIND_META[n.kind] : null
  const when = n.created_at ? timeAgo(n.created_at, undefined, language) : ''
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta?.tone ?? 'bg-neutral-100 text-neutral-500'}`}>
        {meta ? <meta.icon className="h-[18px] w-[18px]" aria-hidden /> : <Bell className="h-[18px] w-[18px]" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-bold text-neutral-900">{n.user_name ?? t('notifications.unknownUser')}</span>
          <span className="shrink-0 text-[11.5px] text-neutral-500">{when}</span>
        </span>
        <span className="block text-[11.5px] font-bold uppercase tracking-wide text-neutral-500">{meta ? t(meta.labelKey) : n.kind}</span>
        <span className={`mt-0.5 block text-[13px] text-neutral-700 ${compact ? 'truncate' : ''}`}>
          {n.comment}
          {compact && n.customer_name ? ` · ${n.customer_name}` : ''}
        </span>
        {!compact && n.customer_name && <span className="mt-0.5 block text-xs text-neutral-500">{n.customer_name}</span>}
      </span>
    </div>
  )
}
