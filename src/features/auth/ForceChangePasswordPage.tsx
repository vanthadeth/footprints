import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { haptic } from '@/lib/haptic'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * Blocks the app until a user with `must_change_password` set (new
 * account, or an admin generated them a fresh temp password) picks their
 * own password. Same form as ResetPasswordPage, plus clearing the flag
 * that got them sent here in the first place.
 */
export function ForceChangePasswordPage({ onDone }: { onDone: () => void }) {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading || !session) return
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) {
      haptic('error')
      setError(authError.message)
      setLoading(false)
      return
    }

    const { error: flagError } = await supabase.from('users').update({ must_change_password: false }).eq('id', session.user.id)
    setLoading(false)
    if (flagError) {
      haptic('error')
      setError(flagError.message)
      return
    }

    haptic('success')
    onDone()
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-neutral-50 px-6 safe-top safe-bottom">
      <ThemeToggle />
      <div className="mx-auto w-full max-w-sm animate-fade-in-up">
        <h1 className="text-xl font-semibold text-neutral-900">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          Your password was set by an admin. Pick one only you know before continuing.
        </p>
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
