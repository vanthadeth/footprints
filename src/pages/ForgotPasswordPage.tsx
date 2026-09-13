import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { haptic } from '@/lib/haptic'
import { ThemeToggle } from '@/components/ThemeToggle'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const { error } = await requestPasswordReset(email)
    setLoading(false)
    if (error) {
      haptic('error')
      setError(error)
      return
    }
    haptic('success')
    setSent(true)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-neutral-50 px-6 safe-top safe-bottom">
      <ThemeToggle />
      <div className="mx-auto w-full max-w-sm animate-fade-in-up">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-1 text-sm font-medium text-neutral-600 tap-target"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="text-xl font-semibold text-neutral-900">Reset your password</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your email and we'll send you a link to reset your password.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            If an account exists for {email}, a reset link is on its way.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {error && (
              <div role="alert" className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand-500 py-4 text-base font-semibold text-white shadow-card active:bg-brand-600 disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
