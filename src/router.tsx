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

// Map libraries (leaflet/react-leaflet) only load once someone actually
// visits a page that needs them, instead of bloating the initial bundle
// every user pays for just to see the Check In screen.
const FootprintsPage = lazy(() => import('@/pages/FootprintsPage').then((m) => ({ default: m.FootprintsPage })))
const FleetPage = lazy(() => import('@/pages/FleetPage').then((m) => ({ default: m.FleetPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

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
      { path: '/check-in', element: <CheckInPage /> },
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
      { path: '/profile', element: <ProfilePage /> },
      { path: '/menu', element: <MenuPage /> },
      {
        path: '/settings',
        element: (
          <Suspense fallback={<PageFallback />}>
            <SettingsPage />
          </Suspense>
        ),
      },
    ],
  },
  { path: '/', element: <Navigate to="/welcome" replace /> },
  { path: '*', element: <Navigate to="/welcome" replace /> },
])
