import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ThemeProvider } from '@/lib/ThemeContext'
import { ConfigErrorPage } from '@/pages/ConfigErrorPage'
import { isSupabaseConfigured } from '@/lib/supabase'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      {/* Rendered once here (not per-page) so light/dark works everywhere,
          including the config-error screen below. */}
      <ThemeToggle />

      {!isSupabaseConfigured ? (
        <ConfigErrorPage />
      ) : (
        <ErrorBoundary>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ErrorBoundary>
      )}
    </ThemeProvider>
  )
}
