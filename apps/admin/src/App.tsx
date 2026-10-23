import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@footprints/shared/features/auth/AuthContext'
import { ThemeProvider } from '@footprints/shared/lib/ThemeContext'
import { LanguageProvider } from '@footprints/shared/i18n/LanguageContext'
import { isSupabaseConfigured } from '@footprints/shared/lib/supabase'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {!isSupabaseConfigured ? (
          <p className="p-8 text-sm text-neutral-500">
            Supabase isn’t configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).
          </p>
        ) : (
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        )}
      </LanguageProvider>
    </ThemeProvider>
  )
}
