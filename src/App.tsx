import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ConfigErrorPage } from '@/pages/ConfigErrorPage'
import { isSupabaseConfigured } from '@/lib/supabase'
import { router } from './router'

export function App() {
  if (!isSupabaseConfigured) {
    return <ConfigErrorPage />
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  )
}
