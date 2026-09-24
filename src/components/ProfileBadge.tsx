import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, LogOut, Menu, Settings, User, UserRound } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { useLanguage } from '@/i18n/LanguageContext'
import { displayName } from '@/lib/displayName'
import { haptic } from '@/lib/haptic'

/** Avatar button in the title bar; opens a small account dropdown (Profile, an inline KH|EN language switch, Setting, Logout). */
export function ProfileBadge() {
  const { profile } = useProfile()
  const avatarUrl = useAvatarUrl(profile?.photo_path)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const { language, setLanguage, t } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = profile ? displayName(profile.full_name, profile.nickname).trim()[0]?.toUpperCase() : undefined

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => {
          haptic('light')
          setOpen((v) => !v)
        }}
        aria-label={t('profile.accountMenu')}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 tap-target dark:bg-brand-500/15 dark:text-brand-300"
      >
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial || <User className="h-4 w-4" aria-hidden />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-72 origin-top-right animate-pop-in rounded-xl2 border border-neutral-200 bg-white py-2 shadow-card dark:border-neutral-700"
        >
          <MenuItem
            icon={UserRound}
            label={t('nav.profile')}
            onClick={() => {
              setOpen(false)
              navigate('/profile')
            }}
          />
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span className="flex items-center gap-3.5 text-sm font-medium text-neutral-700 dark:text-neutral-200">
              <Globe className="h-[18px] w-[18px]" aria-hidden />
              {t('profile.language')}
            </span>
            <div className="flex rounded-full bg-neutral-100 p-0.5 dark:bg-neutral-800">
              {(['km', 'en'] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => {
                    haptic('light')
                    setLanguage(code)
                  }}
                  aria-pressed={language === code}
                  className={`rounded-full px-4 py-2 text-sm font-semibold tap-target ${
                    language === code ? 'bg-white text-brand-700 shadow-sm dark:bg-neutral-700 dark:text-brand-300' : 'text-neutral-500'
                  }`}
                >
                  {code === 'km' ? 'KH' : 'EN'}
                </button>
              ))}
            </div>
          </div>
          <MenuItem
            icon={Menu}
            label={t('nav.hub')}
            onClick={() => {
              setOpen(false)
              navigate('/menu')
            }}
          />
          <MenuItem
            icon={Settings}
            label={t('profile.setting')}
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
          />
          <div className="my-1.5 border-t border-neutral-100 dark:border-neutral-800" />
          <MenuItem
            icon={LogOut}
            label={t('profile.logout')}
            tone="danger"
            onClick={() => {
              setOpen(false)
              haptic('light')
              setLogoutConfirmOpen(true)
            }}
          />
        </div>
      )}

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: typeof User
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-sm font-medium tap-target ${
        tone === 'danger' ? 'text-status-danger' : 'text-neutral-700 dark:text-neutral-200'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </button>
  )
}
