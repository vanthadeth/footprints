import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MapPin, Clock, LayoutGrid, ChevronRight, Settings, type LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'
import { OfflineBanner } from '@/components/OfflineBanner'
import { TitleBar } from '@/components/TitleBar'
import { JourneyProvider, useJourneyContext } from '@/features/attendance/JourneyContext'
import { NotificationsProvider } from '@/features/notifications/NotificationsContext'
import { MessagesProvider, useMessages } from '@/features/conversations/MessagesContext'
import { PermissionsProvider } from '@/features/permissions/PermissionsContext'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove, homeFor, hubFunctions, tabsFor, type FnKey, type NavContext, type TabKey } from '@/features/nav/navConfig'
import { setBackNav } from '@/features/nav/historyGuard'
import { prefetchPages } from '@/lib/lazyPage'
import { useLanguage } from '@/i18n/LanguageContext'

/**
 * Mobile-first shell. The tabs follow the person's role group
 * (features/nav/navConfig): salespeople get Calendar · Messages · ●Check In
 * · Briefing · Hub, managers Team · Customers · ●Check In · Approvals · Hub,
 * and so on -- Check In always raised in the middle. The desktop rail lists
 * the same tabs, then the Hub's functions (one open at a time), so office
 * screens don't need a trip to Hub.
 */
export function AppLayout() {
  const location = useLocation()
  // Signed in and on screen: warm every other screen's code in the background.
  useEffect(() => prefetchPages(), [])

  return (
    <PermissionsProvider>
      <BackNav />
      <JourneyProvider>
        <NotificationsProvider>
          <MessagesProvider>
            <div className="flex min-h-dvh flex-col bg-neutral-50 md:flex-row">
              <OfflineBanner />
              <DesktopSidebar />

              <div className="flex min-w-0 flex-1 flex-col">
                <TitleBar />

                <main className="flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
                  {/* Keying by path remounts this div on every tab switch, which
                      restarts the fade-in-up animation -- a lightweight stand-in
                      for a real route-transition library. */}
                  <div key={location.pathname} className="animate-fade-in-up">
                    <Outlet />
                  </div>
                </main>
              </div>

              <MobileTabBar />
            </div>
          </MessagesProvider>
        </NotificationsProvider>
      </JourneyProvider>
    </PermissionsProvider>
  )
}

/** Tells the Back-button guard which screens are this person's tabs and which is home. */
function BackNav() {
  const { group, ctx, ready } = useRoleGroup()
  useEffect(() => {
    if (!ready) return
    setBackNav({ tabs: tabsFor(group, ctx).map((t) => t.to), home: homeFor(group, ctx) })
    return () => setBackNav(null)
  }, [group, ctx, ready])
  return null
}

function DesktopSidebar() {
  const { attendance } = useJourneyContext()
  const { t } = useLanguage()
  const { group, ctx } = useRoleGroup()
  const badges = useTabBadges(ctx)
  const checkInLabel = attendance === 'CLOCKED_IN' ? t('nav.checkIn') : t('nav.clockIn')
  const tabs = tabsFor(group, ctx).filter((tab) => tab.key !== 'hub')
  const functions = hubFunctions(group, ctx)
  const { pathname, search } = useLocation()
  // The function holding the current screen (or whose /menu/:fn page is open) starts open; one open at a time.
  const here = functions.find((f) => pathname === `/menu/${f.key}` || f.rows.some((r) => r.to === pathname + search || r.to === pathname))?.key ?? null
  const [open, setOpen] = useState<FnKey | null>(here)
  useEffect(() => {
    if (here) setOpen(here)
  }, [here])

  return (
    <nav className="hidden shrink-0 flex-col gap-1 overflow-y-auto border-r border-neutral-200 bg-white p-3 pt-4 md:flex md:w-60" aria-label="Primary">
      {/* No logo/brand block here -- TitleBar (to the right) already shows it, alongside the current page's title. */}
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-100'}`
          }
        >
          <tab.icon className="h-5 w-5" aria-hidden />
          <span className="flex-1">{tab.key === 'checkin' ? checkInLabel : t(tab.labelKey)}</span>
          {badges[tab.key] ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-bold text-white">{badges[tab.key]}</span> : null}
        </NavLink>
      ))}
      <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800" />
      {functions.map((f) => {
        const isOpen = open === f.key
        return (
          <div key={f.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : f.key)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-bold text-neutral-800 hover:bg-neutral-100"
            >
              <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-white ${f.tone}`}>
                <f.icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="flex-1">{t(f.titleKey)}</span>
              <span className="text-[11px] font-bold text-neutral-400">{f.rows.length}</span>
              <ChevronRight className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
            </button>
            {isOpen && (
              <div className="pb-1.5 pl-[42px]">
                {f.rows.map((row) => (
                  <NavLink
                    key={row.key}
                    to={row.to}
                    end
                    className={({ isActive }) => `flex items-center rounded-md px-2 py-1.5 text-[13px] ${isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
                  >
                    <span className="flex-1">{row.label}</span>
                    {row.key === 'approvals' && badges.approvals ? <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[10.5px] font-bold text-white">{badges.approvals}</span> : null}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <NavLink
        to="/menu/account"
        className={({ isActive }) => `mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
      >
        <Settings className="h-[18px] w-[18px]" aria-hidden />
        {t('nav.account')}
      </NavLink>
      <NavLink
        to="/menu"
        end
        className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
      >
        <LayoutGrid className="h-5 w-5" aria-hidden />
        {t('nav.hub')}
      </NavLink>
    </nav>
  )
}

/** Badge counts per tab: approvals waiting on the caller, unread messages. */
function useTabBadges(ctx: NavContext): Partial<Record<TabKey, number>> {
  const approvals = usePendingApprovals(canApprove(ctx))
  const { unreadCount } = useMessages()
  return { approvals, messages: unreadCount }
}

function MobileTabBar() {
  const { attendance } = useJourneyContext()
  const { t } = useLanguage()
  const { group, ctx } = useRoleGroup()
  const badges = useTabBadges(ctx)
  const isClockedIn = attendance === 'CLOCKED_IN'
  const checkInLabel = isClockedIn ? t('nav.checkIn') : t('nav.clockIn')
  const CheckInIcon = isClockedIn ? MapPin : Clock
  const tabs = tabsFor(group, ctx)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur safe-bottom md:hidden" aria-label="Primary">
      <div className="mx-auto flex max-w-lg items-start justify-between px-1 pt-2">
        {tabs.map((tab) =>
          tab.key === 'checkin' ? (
            <NavLink key={tab.key} to="/check-in" onClick={() => haptic('light')} className="relative -mt-8 flex flex-1 flex-col items-center gap-1">
              {({ isActive }) => (
                <>
                  <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand-500 text-white ring-4 ring-neutral-50 dark:ring-neutral-950">
                    <CheckInIcon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className={`pb-2 text-[11px] font-bold ${isActive ? 'text-brand-700' : 'text-neutral-500'}`}>{checkInLabel}</span>
                </>
              )}
            </NavLink>
          ) : (
            <MobileTabLink key={tab.key} to={tab.to} icon={tab.icon} label={t(tab.labelKey)} badge={badges[tab.key]} />
          ),
        )}
      </div>
    </nav>
  )
}

function MobileTabLink({ to, icon: Icon, label, badge }: { to: string; icon: LucideIcon; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      onClick={() => haptic('light')}
      className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 pb-2 text-[11px] tap-target ${isActive ? 'font-bold text-brand-700' : 'font-semibold text-neutral-500'}`}
    >
      {({ isActive }) => (
        <>
          <span className={`relative flex h-[30px] w-14 items-center justify-center rounded-full ${isActive ? 'bg-brand-50' : ''}`}>
            <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
            {badge ? <span className="absolute -top-1 right-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span> : null}
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
