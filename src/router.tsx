import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { RedirectIfAuthed } from '@/features/auth/RedirectIfAuthed'
import { WelcomePage } from '@/pages/WelcomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { CheckInPage } from '@/pages/CheckInPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { MenuPage } from '@/pages/MenuPage'
import { StartPage } from '@/pages/StartPage'

// Map libraries (leaflet/react-leaflet) only load once someone actually
// visits a page that needs them, instead of bloating the initial bundle
// every user pays for just to see the Check In screen.
const FootprintsPage = lazy(() => import('@/pages/FootprintsPage').then((m) => ({ default: m.FootprintsPage })))
const FleetPage = lazy(() => import('@/pages/FleetPage').then((m) => ({ default: m.FleetPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const CustomersPage = lazy(() => import('@/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))
const VisitsPage = lazy(() => import('@/pages/VisitsPage').then((m) => ({ default: m.VisitsPage })))
const ReportPage = lazy(() => import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })))
const LeaveApprovalsPage = lazy(() => import('@/pages/LeaveApprovalsPage').then((m) => ({ default: m.LeaveApprovalsPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const LocationsPage = lazy(() => import('@/pages/LocationsPage').then((m) => ({ default: m.LocationsPage })))
const TranslationsPage = lazy(() => import('@/pages/TranslationsPage').then((m) => ({ default: m.TranslationsPage })))
const LeavePage = lazy(() => import('@/pages/LeavePage').then((m) => ({ default: m.LeavePage })))

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: '/welcome',
    element: (
      <RedirectIfAuthed>
        <WelcomePage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/start', element: <StartPage /> },
      { path: '/check-in', element: <CheckInPage /> },
      {
        path: '/home',
        element: (
          <Suspense fallback={<PageFallback />}>
            <HomePage />
          </Suspense>
        ),
      },
      {
        path: '/customers',
        element: (
          <Suspense fallback={<PageFallback />}>
            <CustomersPage />
          </Suspense>
        ),
      },
      {
        path: '/customers/:id',
        element: (
          <Suspense fallback={<PageFallback />}>
            <CustomerDetailPage />
          </Suspense>
        ),
      },
      {
        path: '/visits',
        element: (
          <Suspense fallback={<PageFallback />}>
            <VisitsPage />
          </Suspense>
        ),
      },
      {
        path: '/footprints',
        element: (
          <Suspense fallback={<PageFallback />}>
            <FootprintsPage />
          </Suspense>
        ),
      },
      {
        path: '/fleet',
        element: (
          <Suspense fallback={<PageFallback />}>
            <FleetPage />
          </Suspense>
        ),
      },
      {
        path: '/leave',
        element: (
          <Suspense fallback={<PageFallback />}>
            <LeavePage />
          </Suspense>
        ),
      },
      {
        path: '/leave/approvals',
        element: (
          <Suspense fallback={<PageFallback />}>
            <LeaveApprovalsPage />
          </Suspense>
        ),
      },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/menu', element: <MenuPage /> },
      {
        path: '/report',
        element: (
          <Suspense fallback={<PageFallback />}>
            <ReportPage />
          </Suspense>
        ),
      },
      // Old destinations from earlier navs -- kept as redirects so bookmarks and installed-PWA start URLs don't 404.
      { path: '/more', element: <Navigate to="/menu" replace /> },
      { path: '/performance', element: <Navigate to="/report" replace /> },
      {
        path: '/settings',
        element: (
          <Suspense fallback={<PageFallback />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: '/users',
        element: (
          <Suspense fallback={<PageFallback />}>
            <UsersPage />
          </Suspense>
        ),
      },
      {
        path: '/notifications',
        element: (
          <Suspense fallback={<PageFallback />}>
            <NotificationsPage />
          </Suspense>
        ),
      },
      {
        path: '/locations',
        element: (
          <Suspense fallback={<PageFallback />}>
            <LocationsPage />
          </Suspense>
        ),
      },
      {
        path: '/translations',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TranslationsPage />
          </Suspense>
        ),
      },
    ],
  },
  { path: '/', element: <Navigate to="/welcome" replace /> },
  { path: '*', element: <Navigate to="/welcome" replace /> },
])
