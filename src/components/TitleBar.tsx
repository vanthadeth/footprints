import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ProfileBadge } from '@/components/ProfileBadge'
import { NotificationBell } from '@/components/NotificationBell'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { FN, tabsFor, type FnKey } from '@/features/nav/navConfig'
import { parentPath } from '@/features/nav/backNav'

const TITLE_KEYS: Record<string, string> = {
  '/footprints': 'nav.footprints',
  '/fleet': 'nav.fleet',
  '/profile': 'nav.profile',
  '/menu': 'nav.hub',
  '/menu/account': 'nav.account',
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
  '/trips': 'nav.trips',
  '/trips/new': 'nav.newTrip',
  '/trips/calendar': 'nav.tripsCalendar',
  '/settings/trips': 'nav.tripSettings',
  '/settings/sheet-sync': 'nav.sheetSync',
  '/admin/attendance': 'nav.adminAttendance',
  '/admin/geofence': 'nav.geofence',
  '/admin/sync': 'nav.dataSync',
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
          : pathname.startsWith('/menu/') && Object.prototype.hasOwnProperty.call(FN, pathname.slice(6))
            ? t(FN[pathname.slice(6) as FnKey].titleKey)
          : pathname.startsWith('/trips/') && !TITLE_KEYS[pathname]
            ? t(pathname.endsWith('/edit') ? 'nav.editTrip' : 'nav.trip')
          : t(TITLE_KEYS[pathname] ?? 'nav.footprints')
  // The person's tabs get the large title; everything else is a sub-page with a back link.
  const { group, ctx } = useRoleGroup()
  const isRoot = tabsFor(group, ctx).some((tab) => tab.to === pathname)

  const scrolled = useScrolled(pathname)
  const largeRef = useRef<HTMLHeadingElement>(null)
  const [titleGone, setTitleGone] = useState(false)
  useEffect(() => {
    // The compact title appears once the large one has scrolled up under the bar.
    const el = largeRef.current
    if (!isRoot || !el) return setTitleGone(false)
    const io = new IntersectionObserver(([e]) => setTitleGone(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [isRoot, pathname])

  // The bar's background: the page itself at the top, frosted with a hairline once the page scrolls under it.
  const bar = (compact: boolean) =>
    `sticky top-0 z-10 transition-[background-color,border-color] duration-200 ${
      compact ? 'border-b border-neutral-200/80 bg-neutral-50/95 backdrop-blur-xl dark:border-neutral-800 dark:bg-[#1c1c1c]/95' : 'border-b border-transparent bg-neutral-50 dark:bg-[#1c1c1c]'
    }`

  if (isRoot) {
    const today = new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    return (
      <>
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className={`${bar(titleGone)} px-4 md:px-8`}>
          <div className="relative flex h-14 items-center justify-between gap-3">
            <span className={`text-[13px] font-semibold text-neutral-500 transition-opacity duration-200 ${titleGone ? 'opacity-0' : 'opacity-100'}`}>{today}</span>
            <span
              aria-hidden={!titleGone}
              className={`pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-bold text-neutral-900 transition-all duration-200 ${titleGone ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
            >
              {title}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell framed />
              <ProfileBadge />
            </div>
          </div>
        </header>
        <h1 ref={largeRef} className="-mt-1.5 px-4 pb-1.5 text-[30px] font-extrabold leading-9 tracking-[-0.02em] text-neutral-900 md:px-8">
          {title}
        </h1>
      </>
    )
  }

  return (
    <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className={`${bar(scrolled)} px-3 md:px-8`}>
      <div className={`grid h-14 items-center ${'grid-cols-[44px_minmax(0,1fr)_44px] md:grid-cols-[0px_minmax(0,1fr)_auto]'}`}>
        <Link to={parentPath(pathname, search)} replace aria-label={t('common.back')} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-900 md:hidden">
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </Link>
        <h1 className="truncate px-1 text-center text-[17px] font-bold text-neutral-900 md:text-left">{title}</h1>
        <div className="flex items-center justify-end gap-2">
          <NotificationBell />
          <span className="hidden md:block">
            <ProfileBadge />
          </span>
        </div>
      </div>
    </header>
  )
}

/** True once the page has scrolled a little (reset on every new screen). */
function useScrolled(key: string): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])
  return scrolled
}
