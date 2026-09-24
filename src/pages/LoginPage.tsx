import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { haptic } from '@/lib/haptic'
import { LANGUAGES } from '@/lib/language'
import logoIcon from '@/assets/logo-icon.png'

export function LoginPage() {
  const { signInWithPassword } = useAuth()
  const { t, language, setLanguage } = useLanguage()
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
    navigate('/start', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 safe-bottom">
      {/* Navy hero: logo + app name, with the language switch where a first-time user will look for it. */}
      <div className="relative flex min-h-[300px] flex-col overflow-hidden bg-brand-900 px-5 pb-11 safe-top">
        <div className="pointer-events-none absolute -left-10 top-24 h-40 w-40 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-12 -top-6 h-52 w-52 rounded-full border border-white/10" />
        <div className="relative flex justify-end pt-4">
          <div role="group" aria-label="Language" className="flex gap-0.5 rounded-full bg-white/10 p-[3px]">
            {LANGUAGES.slice()
              .reverse()
              .map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={language === l.code}
                  onClick={() => {
                    haptic('light')
                    setLanguage(l.code)
                  }}
                  className={`h-8 min-w-[52px] rounded-full px-3 text-xs font-bold ${language === l.code ? 'bg-white text-brand-900' : 'text-brand-100'}`}
                >
                  {l.code === 'en' ? 'EN' : l.nativeLabel}
                </button>
              ))}
          </div>
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 pt-4">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <img src={logoIcon} alt="" className="h-12 w-12" />
          </span>
          <div className="text-center">
            <p className="text-[28px] font-extrabold tracking-tight text-white">Footprints</p>
            <p className="text-[13px] text-brand-100">HIG field team</p>
          </div>
        </div>
      </div>

      <div className="relative -mt-6 flex flex-1 flex-col rounded-t-3xl bg-neutral-50 px-5 pb-6 pt-7 dark:bg-neutral-950">
        <div className="mx-auto w-full max-w-sm flex-1 animate-fade-in-up">
          <h1 className="text-[22px] font-bold text-neutral-900">{t('login.welcomeBack')}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t('login.readySubtitle')}</p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3.5" noValidate>
            {error && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-status-danger/10 px-3 py-2.5 text-[13px] font-semibold text-status-danger">
                <AlertCircle className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-neutral-600">
                {t('login.emailLabel')}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" aria-hidden />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  className={`h-12 w-full rounded-xl border-[1.5px] bg-white pl-11 pr-4 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/30 ${
                    error ? 'border-status-danger' : 'border-neutral-200'
                  }`}
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-neutral-600">
                {t('login.passwordLabel')}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" aria-hidden />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!error}
                  className={`h-12 w-full rounded-xl border-[1.5px] bg-white pl-11 pr-12 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/30 ${
                    error ? 'border-status-danger' : 'border-neutral-200'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-neutral-400 tap-target"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="!mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold text-white shadow-[0_4px_14px_rgba(22,104,184,0.3)] transition-colors active:bg-brand-600 disabled:opacity-60"
            >
              {loading ? t('login.signingIn') : t('login.logIn')}
              {!loading && <ArrowRight className="h-[18px] w-[18px]" aria-hidden />}
            </button>
          </form>

          {/* Biometric login (Face/Touch ID via WebAuthn) after a first successful
              password sign-in is a natural next step here, but there's no
              WebAuthn groundwork in this app yet -- a separate project. */}

          <div className="mt-3 flex justify-center">
            <button onClick={() => navigate('/forgot-password')} className="px-3 text-sm font-semibold text-brand-500 tap-target">
              {t('login.forgotPassword')}
            </button>
          </div>
        </div>

        <p className="mx-auto mt-6 w-full max-w-sm rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-center text-[13px] text-neutral-500">
          {t('login.newToApp')}{' '}
          <a href="mailto:admin@hig.example" className="font-bold text-brand-500">
            {t('login.contactAdmin')}
          </a>
        </p>
      </div>
    </div>
  )
}
