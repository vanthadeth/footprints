import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from '@footprints/shared/features/auth/RequireAuth'
import { RedirectIfAuthed } from '@footprints/shared/features/auth/RedirectIfAuthed'
import { LoginPage } from '@footprints/shared/pages/LoginPage'
import { ForgotPasswordPage } from '@footprints/shared/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@footprints/shared/pages/ResetPasswordPage'
import { RequireSuperAdmin } from '@/features/auth/RequireSuperAdmin'
import { AdminLayout } from '@/layouts/AdminLayout'
import { SectionPage } from '@/pages/SectionPage'
import { UsersPage } from '@/pages/UsersPage'
import { DataSyncPage } from '@/pages/DataSyncPage'
import { ComponentsPreviewPage } from '@footprints/shared/pages/ComponentsPreviewPage'
import { SECTIONS } from '@/sections'

// The shared auth screens redirect to /start after sign-in and to /welcome when
// signed out; the admin app has no welcome screen, so both map onto its own routes.
export const router = createBrowserRouter([
  { path: '/welcome', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <RedirectIfAuthed><LoginPage /></RedirectIfAuthed> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/start', element: <Navigate to="/users" replace /> },
  {
    element: (
      <RequireAuth>
        <RequireSuperAdmin>
          <AdminLayout />
        </RequireSuperAdmin>
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Navigate to="/users" replace /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/sync', element: <DataSyncPage /> },
      { path: '/components', element: <ComponentsPreviewPage /> },
      ...SECTIONS.filter((s) => s.path !== '/users' && s.path !== '/sync' && s.path !== '/components').map((s) => ({ path: s.path, element: <SectionPage section={s} /> })),
      { path: '*', element: <Navigate to="/users" replace /> },
    ],
  },
])
