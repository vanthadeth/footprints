import { useLocation } from 'react-router-dom'
import { ProfileBadge } from '@/components/ProfileBadge'
import { NotificationBell } from '@/components/NotificationBell'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useLanguage } from '@/i18n/LanguageContext'

const TITLE_KEYS: Record<string, string> = {
  '/footprints': 'nav.footprints',
  '/fleet': 'nav.fleet',
  '/profile': 'nav.profile',
  '/menu': 'nav.menu',
  '/settings': 'nav.settings',
  '/users': 'nav.users',
  '/home': 'nav.home',
  '/customers': 'nav.customers',
  '/visits': 'nav.visits',
  '/more': 'nav.more',
  '/performance': 'nav.performance',
  '/notifications': 'nav.notifications',
  '/locations': 'nav.locations',
  '/translations': 'nav.translations',
}

/**
 * The one top bar for every authenticated screen (rendered once from
 * AppLayout, like the bottom nav/sidebar) -- replaces each page's own ad
 * hoc header (PageHeader, CheckInPage's greeting row, Footprints' hero
 * title) so the app has one consistent place for title + theme + account.
 */
export function TitleBar() {
  const { pathname } = useLocation()
  const { attendance } = useJourneyContext()
  const { t } = useLanguage()
  const title =
    pathname === '/check-in'
      ? attendance === 'CLOCKED_IN'
        ? t('nav.checkIn')
        : t('nav.clockIn')
      : pathname.startsWith('/customers/')
        ? t('nav.customer')
        : t(TITLE_KEYS[pathname] ?? 'nav.footprints')

  return (
    <header
      // Explicit calc(), not the .safe-top utility class -- that class sets
      // padding-top on its own, which would just replace py-3's padding-top
      // instead of adding to it (both set the same property, so whichever
      // wins in the cascade fully overrides the other -- on a device with
      // no safe-area inset, that collapsed the top padding to 0, which is
      // why it looked tighter at the top than the bottom).
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 pb-3 backdrop-blur dark:border-neutral-800 md:px-8"
    >
      <h1 className="text-lg font-semibold text-neutral-700">{title}</h1>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <ProfileBadge />
      </div>
    </header>
  )
}
