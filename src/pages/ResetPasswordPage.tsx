import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { haptic } from '@/lib/haptic'

/** Landed on via the reset-password email link; Supabase has already exchanged the token for a session by the time this renders. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      haptic('error')
      setError(error.message)
      return
    }
    haptic('success')
    navigate('/check-in', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-neutral-50 px-6 safe-top safe-bottom">
      <div className="mx-auto w-full max-w-sm animate-fade-in-up">
        <h1 className="text-xl font-semibold text-neutral-900">Set a new password</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
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
            {loading ? 'Saving…' : 'Save Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
