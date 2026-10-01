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
import { RequirePermission } from '@/features/permissions/RequirePermission'

// Map libraries (leaflet/react-leaflet) only load once someone actually
// visits a page that needs them, instead of bloating the initial bundle
// every user pays for just to see the Check In screen.
const FootprintsPage = lazy(() => import('@/pages/FootprintsPage').then((m) => ({ default: m.FootprintsPage })))
const CustomerBriefingPage = lazy(() => import('@/pages/CustomerBriefingPage').then((m) => ({ default: m.CustomerBriefingPage })))
const OrgPage = lazy(() => import('@/pages/OrgPage').then((m) => ({ default: m.OrgPage })))
const FleetPage = lazy(() => import('@/pages/FleetPage').then((m) => ({ default: m.FleetPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const CustomersPage = lazy(() => import('@/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))
const VisitsPage = lazy(() => import('@/pages/VisitsPage').then((m) => ({ default: m.VisitsPage })))
const ReportPage = lazy(() => import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })))
const LeaveApprovalsPage = lazy(() => import('@/pages/LeaveApprovalsPage').then((m) => ({ default: m.LeaveApprovalsPage })))
const WorkingHoursPage = lazy(() => import('@/pages/WorkingHoursPage').then((m) => ({ default: m.WorkingHoursPage })))
const HolidaysPage = lazy(() => import('@/pages/HolidaysPage').then((m) => ({ default: m.HolidaysPage })))
const LeaveAllowancesPage = lazy(() => import('@/pages/LeaveAllowancesPage').then((m) => ({ default: m.LeaveAllowancesPage })))
const PlanPage = lazy(() => import('@/pages/PlanPage').then((m) => ({ default: m.PlanPage })))
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const MessageThreadPage = lazy(() => import('@/pages/MessageThreadPage').then((m) => ({ default: m.MessageThreadPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const LocationsPage = lazy(() => import('@/pages/LocationsPage').then((m) => ({ default: m.LocationsPage })))
const TranslationsPage = lazy(() => import('@/pages/TranslationsPage').then((m) => ({ default: m.TranslationsPage })))
const PermissionsPage = lazy(() => import('@/pages/PermissionsPage').then((m) => ({ default: m.PermissionsPage })))
const TodayPage = lazy(() => import('@/pages/TodayPage').then((m) => ({ default: m.TodayPage })))
const TeamHomePage = lazy(() => import('@/pages/TeamHomePage').then((m) => ({ default: m.TeamHomePage })))
const PeoplePage = lazy(() => import('@/pages/PeoplePage').then((m) => ({ default: m.PeoplePage })))
const TripsPage = lazy(() => import('@/pages/TripsPage').then((m) => ({ default: m.TripsPage })))
const TripRequestPage = lazy(() => import('@/pages/TripRequestPage').then((m) => ({ default: m.TripRequestPage })))
const TripDetailPage = lazy(() => import('@/pages/TripDetailPage').then((m) => ({ default: m.TripDetailPage })))
const TripSettingsPage = lazy(() => import('@/pages/TripSettingsPage').then((m) => ({ default: m.TripSettingsPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const FlexTeamPage = lazy(() => import('@/pages/FlexTeamPage').then((m) => ({ default: m.FlexTeamPage })))
const DaysOffPage = lazy(() => import('@/pages/DaysOffPage').then((m) => ({ default: m.DaysOffPage })))
const FlexSettlementPage = lazy(() => import('@/pages/FlexSettlementPage').then((m) => ({ default: m.FlexSettlementPage })))
const AccountPage = lazy(() => import('@/pages/AccountPage').then((m) => ({ default: m.AccountPage })))
const HubFunctionPage = lazy(() => import('@/pages/HubFunctionPage').then((m) => ({ default: m.HubFunctionPage })))
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
        path: '/plan',
        element: (
          <RequirePermission module="plan">
            <Suspense fallback={<PageFallback />}>
              <PlanPage />
            </Suspense>
          </RequirePermission>
        ),
      },
      {
        path: '/today',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TodayPage />
          </Suspense>
        ),
      },
      {
        path: '/team',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TeamHomePage />
          </Suspense>
        ),
      },
      {
        path: '/people',
        element: (
          <Suspense fallback={<PageFallback />}>
            <PeoplePage />
          </Suspense>
        ),
      },
      {
        path: '/admin',
        element: (
          <Suspense fallback={<PageFallback />}>
            <AdminPage />
          </Suspense>
        ),
      },
      {
        path: '/calendar',
        element: (
          <Suspense fallback={<PageFallback />}>
            <CalendarPage />
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
          <RequirePermission module="footprints">
            <Suspense fallback={<PageFallback />}>
              <FootprintsPage />
            </Suspense>
          </RequirePermission>
        ),
      },
      {
        path: '/team/customers',
        element: (
          <RequirePermission module="customer_briefing">
            <Suspense fallback={<PageFallback />}>
              <CustomerBriefingPage />
            </Suspense>
          </RequirePermission>
        ),
      },
      {
        path: '/fleet',
        element: (
          <RequirePermission module="team_map">
            <Suspense fallback={<PageFallback />}>
              <FleetPage />
            </Suspense>
          </RequirePermission>
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
        path: '/leave/flexible',
        element: (
          <Suspense fallback={<PageFallback />}>
            <FlexTeamPage />
          </Suspense>
        ),
      },
      {
        path: '/leave/days-off',
        element: (
          <Suspense fallback={<PageFallback />}>
            <DaysOffPage />
          </Suspense>
        ),
      },
      {
        path: '/leave/days-off/settlement',
        element: (
          <Suspense fallback={<PageFallback />}>
            <FlexSettlementPage />
          </Suspense>
        ),
      },
      {
        path: '/leave/allowances',
        element: (
          <Suspense fallback={<PageFallback />}>
            <LeaveAllowancesPage />
          </Suspense>
        ),
      },
      {
        path: '/settings/working-hours',
        element: (
          <Suspense fallback={<PageFallback />}>
            <WorkingHoursPage />
          </Suspense>
        ),
      },
      {
        path: '/settings/holidays',
        element: (
          <Suspense fallback={<PageFallback />}>
            <HolidaysPage />
          </Suspense>
        ),
      },
      {
        path: '/approvals',
        element: (
          <Suspense fallback={<PageFallback />}>
            <LeaveApprovalsPage />
          </Suspense>
        ),
      },
      { path: '/leave/approvals', element: <Navigate to="/approvals" replace /> },
      {
        path: '/trips',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TripsPage />
          </Suspense>
        ),
      },
      {
        path: '/trips/new',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TripRequestPage />
          </Suspense>
        ),
      },
      {
        path: '/trips/:id/edit',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TripRequestPage />
          </Suspense>
        ),
      },
      {
        path: '/trips/:id',
        element: (
          <Suspense fallback={<PageFallback />}>
            <TripDetailPage />
          </Suspense>
        ),
      },
      {
        path: '/settings/trips',
        element: (
          <RequirePermission module="settings" action="edit" fallback="/menu">
            <Suspense fallback={<PageFallback />}>
              <TripSettingsPage />
            </Suspense>
          </RequirePermission>
        ),
      },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/menu', element: <MenuPage /> },
      {
        path: '/menu/account',
        element: (
          <Suspense fallback={<PageFallback />}>
            <AccountPage />
          </Suspense>
        ),
      },
      {
        path: '/menu/:fn',
        element: (
          <Suspense fallback={<PageFallback />}>
            <HubFunctionPage />
          </Suspense>
        ),
      },
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
        path: '/settings/org',
        element: (
          <Suspense fallback={<PageFallback />}>
            <OrgPage />
          </Suspense>
        ),
      },
      {
        path: '/settings/permissions',
        element: (
          <RequirePermission module="role_permission" action="edit" fallback="/menu">
            <Suspense fallback={<PageFallback />}>
              <PermissionsPage />
            </Suspense>
          </RequirePermission>
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
        path: '/messages',
        element: (
          <Suspense fallback={<PageFallback />}>
            <MessagesPage />
          </Suspense>
        ),
      },
      {
        path: '/messages/:postId',
        element: (
          <Suspense fallback={<PageFallback />}>
            <MessageThreadPage />
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
