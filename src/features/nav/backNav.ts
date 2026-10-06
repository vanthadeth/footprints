import { fnForPath } from './navConfig'

/** Where a sub-page's back goes -- almost every secondary screen is reached from Hub. */
export function parentPath(pathname: string, search = ''): string {
  if (pathname === '/plan') return '/check-in'
  if (pathname === '/footprints' || pathname === '/report') return '/menu'
  // Someone else's days off (a manager/HR from Flexible days off) goes back to that list.
  const user = new URLSearchParams(search).get('user')
  if (pathname === '/leave/days-off') return user ? '/leave/flexible' : '/leave'
  if (pathname === '/leave/days-off/settlement') return user ? `/leave/days-off?user=${user}` : '/leave/days-off'
  if (pathname === '/trips/calendar') return '/approvals?tab=trips'
  if (pathname.startsWith('/trips/')) return '/trips'
  if (pathname.startsWith('/admin/')) return '/admin'
  if (pathname.startsWith('/customers/')) return '/customers'
  if (pathname.startsWith('/messages/')) return '/messages'
  if (pathname.startsWith('/menu/')) return '/menu'
  // A Hub screen goes back to its function page (Leave & days off, Company setup…).
  const fn = fnForPath(pathname)
  return fn ? `/menu/${fn}` : '/menu'
}

/** Screens shown signed out: back from them never leaves the app. */
const SIGNED_OUT: Record<string, string | null> = {
  '/welcome': null,
  '/login': null,
  '/forgot-password': '/login',
  '/reset-password': '/login',
}

/**
 * What the phone's or browser's Back does on a screen, replacing the
 * browser's own history: a sub-page goes to its parent (the same place as
 * the title bar's ‹), another tab goes to the person's home tab, and the
 * home tab and sign-in screens stay put (null) so Back never leaves the app.
 */
export function appBack(pathname: string, search: string, nav: { tabs: string[]; home: string } | null): string | null {
  if (pathname in SIGNED_OUT) return SIGNED_OUT[pathname]
  if (pathname === '/start') return null
  if (nav) {
    if (pathname === nav.home) return null
    if (nav.tabs.includes(pathname)) return nav.home
  }
  return parentPath(pathname, search)
}
