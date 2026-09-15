import { AlertTriangle, Clock, Hourglass, type LucideIcon } from 'lucide-react'
import type { Database } from '@/types/database.types'

export type NotificationKind = Database['public']['Enums']['notification_kind']

interface KindMeta {
  /** Dotted i18n key -- look up with useLanguage().t() at the render site, not used directly as text. */
  labelKey: string
  icon: LucideIcon
  /** Same tone-chip convention as FlagBadge/FleetStatusBadge. */
  tone: string
}

/** Same look wherever a notification kind appears -- currently just NotificationsPage, but kept separate (like FlagBadge) rather than inlined there. */
export const NOTIFICATION_KIND_META: Record<NotificationKind, KindMeta> = {
  late_clock_in: { labelKey: 'notifications.kindLateClockIn', icon: Clock, tone: 'bg-status-warn/10 text-status-warn' },
  idling_too_long: { labelKey: 'notifications.kindIdlingTooLong', icon: Hourglass, tone: 'bg-status-idling/10 text-status-idling' },
  ineffective_visit: { labelKey: 'notifications.kindIneffectiveVisit', icon: AlertTriangle, tone: 'bg-status-danger/10 text-status-danger' },
}
