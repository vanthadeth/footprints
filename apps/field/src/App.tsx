import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@footprints/shared/features/auth/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from '@footprints/shared/lib/ThemeContext'
import { LanguageProvider } from '@footprints/shared/i18n/LanguageContext'
import { ConfigErrorPage } from '@/pages/ConfigErrorPage'
import { isSupabaseConfigured } from '@footprints/shared/lib/supabase'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {!isSupabaseConfigured ? (
          // No title bar to hold a theme control here, so this screen keeps
          // its own floating ThemeToggle -- see ConfigErrorPage.
          <ConfigErrorPage />
        ) : (
          <ErrorBoundary>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ErrorBoundary>
        )}
      </LanguageProvider>
    </ThemeProvider>
  )
}
