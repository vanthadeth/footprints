import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ProfileBadge } from '@/components/ProfileBadge'
import { NotificationBell } from '@/components/NotificationBell'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { tabsFor } from '@/features/nav/navConfig'

const TITLE_KEYS: Record<string, string> = {
  '/footprints': 'nav.footprints',
  '/fleet': 'nav.fleet',
  '/profile': 'nav.profile',
  '/menu': 'nav.hub',
  '/leave': 'nav.leave',
  '/leave/approvals': 'nav.leaveApprovals',
  '/leave/allowances': 'nav.leaveAllowances',
  '/settings/working-hours': 'nav.workingHours',
  '/settings/holidays': 'nav.holidays',
  '/settings/permissions': 'nav.permissions',
  '/settings/org': 'nav.org',
  '/report': 'nav.report',
  '/settings': 'nav.settings',
  '/users': 'nav.users',
  '/home': 'nav.home',
  '/customers': 'nav.customers',
  '/team/customers': 'nav.customerBriefing',
  '/plan': 'nav.plan',
  '/calendar': 'nav.calendar',
  '/leave/days-off': 'nav.daysOff',
  '/leave/flexible': 'nav.flexTeam',
  '/leave/days-off/settlement': 'nav.settlement',
  '/visits': 'nav.visits',
  '/notifications': 'nav.notifications',
  '/messages': 'nav.messages',
  '/locations': 'nav.locations',
  '/translations': 'nav.translations',
  '/today': 'nav.today',
  '/team': 'nav.team',
  '/people': 'nav.people',
  '/approvals': 'nav.approvals',
  '/admin': 'nav.admin',
}


/** Where a sub-page's back link goes -- almost every secondary screen is reached from Hub. */
function backTarget(pathname: string, search = ''): string {
  if (pathname === '/plan') return '/check-in'
  if (pathname === '/footprints' || pathname === '/report') return '/menu'
  // Someone else's days off (a manager/HR from Flexible days off) goes back to that list.
  const user = new URLSearchParams(search).get('user')
  if (pathname === '/leave/days-off') return user ? '/leave/flexible' : '/leave'
  if (pathname === '/leave/days-off/settlement') return user ? `/leave/days-off?user=${user}` : '/leave/days-off'
  if (pathname.startsWith('/customers/')) return '/customers'
  if (pathname.startsWith('/messages/')) return '/messages'
  return '/menu'
}

/**
 * The one top bar for every authenticated screen (rendered once from
 * AppLayout, like the bottom nav/sidebar). Tab roots get an Apple-style
 * large title under a small date line; sub-pages get a compact bar with a
 * back link.
 */
export function TitleBar() {
  const { pathname, search } = useLocation()
  const { attendance } = useJourneyContext()
  const { t, language } = useLanguage()
  const title =
    pathname === '/check-in'
      ? attendance === 'CLOCKED_IN'
        ? t('nav.checkIn')
        : t('nav.clockIn')
      : pathname.startsWith('/customers/') && !TITLE_KEYS[pathname]
        ? t('nav.customer')
        : pathname.startsWith('/messages/')
          ? t('nav.messageThread')
          : t(TITLE_KEYS[pathname] ?? 'nav.footprints')
  // The person's tabs get the large title; everything else is a sub-page with a back link.
  const { group, ctx } = useRoleGroup()
  const isRoot = tabsFor(group, ctx).some((tab) => tab.to === pathname)

  const actions = (
    <div className="flex items-center gap-1">
      <NotificationBell />
      <ProfileBadge />
    </div>
  )

  if (isRoot) {
    const today = new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    return (
      <header
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
        className="sticky top-0 z-10 bg-neutral-50/95 px-4 pb-3 backdrop-blur md:px-8 dark:bg-neutral-950/95"
      >
        <div className="flex h-11 items-center justify-between">
          <span className="text-[13px] font-semibold text-neutral-500">{today}</span>
          {actions}
        </div>
        <h1 className="mt-0.5 text-[30px] font-extrabold leading-tight tracking-tight text-neutral-900">{title}</h1>
      </header>
    )
  }

  return (
    <header
      // Explicit calc(), not the .safe-top utility class -- that class sets
      // padding-top on its own, which would just replace py-3's padding-top
      // instead of adding to it.
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      className="sticky top-0 z-10 flex items-center gap-1 border-b border-neutral-200 bg-white/95 pb-2 pl-1.5 pr-4 backdrop-blur dark:border-neutral-800 md:px-8"
    >
      <Link
        to={backTarget(pathname, search)}
        aria-label={t('common.back')}
        className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-600 md:hidden"
      >
        <ChevronLeft className="h-6 w-6" aria-hidden />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-neutral-900">{title}</h1>
      {actions}
    </header>
  )
}
