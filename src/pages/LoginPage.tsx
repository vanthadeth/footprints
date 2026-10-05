import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { LOGIN_SCENES, sceneForHour, type SceneKey } from '@/features/auth/loginScenes'
import { useLanguage } from '@/i18n/LanguageContext'
import { useTheme } from '@/lib/ThemeContext'
import { haptic } from '@/lib/haptic'
import { LANGUAGES } from '@/lib/language'
import logoIcon from '@/assets/logo-icon.png'
import logoIconDark from '@/assets/logo-icon-dark.png'

// Greeting colours per scene: dark ink on the bright morning/afternoon skies, white on the evening one.
const SCENE_INK: Record<SceneKey, { title: string; line: string }> = {
  morning: { title: '#3b2a1a', line: 'rgba(59,42,26,.75)' },
  afternoon: { title: '#0f2b4a', line: 'rgba(15,43,74,.75)' },
  evening: { title: '#ffffff', line: 'rgba(255,255,255,.8)' },
}

export function LoginPage() {
  const { signInWithPassword } = useAuth()
  const { t, language, setLanguage } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scene = sceneForHour(new Date().getHours())
  const sceneRef = useRef<HTMLDivElement>(null)

  // The scenes animate with SMIL, which the global reduced-motion CSS can't reach -- pause them directly.
  useEffect(() => {
    const svg = sceneRef.current?.querySelector('svg')
    if (svg && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) svg.pauseAnimations()
  }, [scene])

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

  const greeting = { morning: t('login.goodMorning'), afternoon: t('login.goodAfternoon'), evening: t('login.goodEvening') }[scene]
  const greetingLine = { morning: t('login.morningLine'), afternoon: t('login.afternoonLine'), evening: t('login.eveningLine') }[scene]
  const inputClass = (invalid: boolean) =>
    `h-[52px] w-full rounded-xl border-[1.5px] bg-white pl-11 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:bg-neutral-950 ${
      invalid ? 'border-status-danger' : 'border-neutral-300'
    }`

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 safe-top safe-bottom">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3.5">
        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-neutral-900">
          <img src={theme === 'dark' ? logoIconDark : logoIcon} alt="HIG" className="h-9 w-9" />
          Footprints
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptic('light')
              toggleTheme()
            }}
            aria-label={theme === 'dark' ? t('login.switchToLight') : t('login.switchToDark')}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-neutral-100 text-neutral-900"
          >
            {theme === 'dark' ? <Sun className="h-[17px] w-[17px]" aria-hidden /> : <Moon className="h-[17px] w-[17px]" aria-hidden />}
          </button>
          <div role="radiogroup" aria-label="Language" className="flex gap-0.5 rounded-full bg-neutral-100 p-[3px]">
            {LANGUAGES.slice()
              .reverse()
              .map((l) => {
                const on = language === l.code
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      haptic('light')
                      setLanguage(l.code)
                    }}
                    className={`h-7 rounded-full px-3 text-xs ${on ? 'bg-white font-bold text-neutral-900 shadow-sm dark:bg-neutral-700' : 'font-semibold text-neutral-500'}`}
                  >
                    {l.code === 'en' ? 'EN' : l.nativeLabel}
                  </button>
                )
              })}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-[18px] px-4 pb-6 pt-4">
        <section aria-label={greeting} className="relative h-[200px] overflow-hidden rounded-3xl bg-brand-900">
          <div ref={sceneRef} className="absolute inset-0" dangerouslySetInnerHTML={{ __html: LOGIN_SCENES[scene] }} />
          <div className="absolute left-[18px] right-[18px] top-4">
            <p className="text-2xl font-bold leading-[30px]" style={{ color: SCENE_INK[scene].title, textShadow: '0 1px 8px rgba(0,0,0,.15)' }}>
              {greeting}
            </p>
            <p className="text-[13px] font-medium" style={{ color: SCENE_INK[scene].line }}>
              {greetingLine}
            </p>
          </div>
        </section>

        <div className="animate-fade-in-up">
          <h1 className="text-[30px] font-bold leading-9 tracking-tight text-neutral-900">{t('login.welcomeBack')}</h1>
          <p className="mt-1 text-[15px] text-neutral-500">{t('login.readySubtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          {error && (
            <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-status-danger/10 px-3 py-2.5 text-[13px] font-semibold text-status-danger">
              <AlertCircle className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-semibold text-neutral-600">
              {t('login.emailLabel')}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-neutral-500" aria-hidden />
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error}
                className={`${inputClass(!!error)} pr-4`}
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-[13px] font-semibold text-neutral-600">
                {t('login.passwordLabel')}
              </label>
              <Link to="/forgot-password" className="text-[13px] font-bold text-brand-500">
                {t('login.forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-neutral-500" aria-hidden />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
                className={`${inputClass(!!error)} pr-12`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-neutral-500 tap-target"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold text-white transition-colors active:bg-brand-600 disabled:opacity-60"
          >
            {loading ? t('login.signingIn') : t('login.logIn')}
            {!loading && <ArrowRight className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        </form>

        <div className="mt-auto flex flex-col items-center gap-2.5 pt-2 text-center">
          <p className="text-sm text-neutral-500">
            {t('login.newToApp')}{' '}
            <a href="mailto:admin@hig.example" className="font-bold text-brand-500">
              {t('login.contactAdmin')}
            </a>
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('login.privacyNote')}
          </p>
        </div>
      </main>
    </div>
  )
}
