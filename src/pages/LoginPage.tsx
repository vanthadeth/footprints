import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { haptic } from '@/lib/haptic'
import { LogoIcon } from '@/components/Logo'

export function LoginPage() {
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const { error } = await signInWithPassword(email, password)
    setLoading(false)
    if (error) {
      haptic('error')
      setError(error)
      return
    }
    haptic('success')
    navigate('/check-in', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-neutral-50 px-6 safe-top safe-bottom">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoIcon alt="Footprints" className="mb-3 h-12 w-12" />
          <h1 className="text-xl font-semibold text-neutral-900">Welcome back</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to continue your journey</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 pr-12 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-neutral-400 tap-target"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-semibold text-white shadow-card transition-colors active:bg-brand-600 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Log In'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <button
            onClick={() => navigate('/forgot-password')}
            className="font-medium text-brand-600 tap-target"
          >
            Forgot Password?
          </button>
          <p className="text-neutral-500">
            New here?{' '}
            <a href="mailto:admin@hig.example" className="font-medium text-brand-600">
              Contact Admin for Registration
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
