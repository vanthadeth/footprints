import { useEffect, useRef, useState } from 'react'
import { useBackHandler } from '@/hooks/useBackHandler'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, Briefcase, CalendarCheck, ChevronRight, LogOut, Settings, User } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { useLanguage } from '@/i18n/LanguageContext'
import { useTheme } from '@/lib/ThemeContext'
import type { ThemeMode } from '@/lib/theme'
import { formatTime } from '@/lib/datetime'
import { displayName } from '@/lib/displayName'
import { haptic } from '@/lib/haptic'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/**
 * Avatar button in the title bar. Opens the profile menu from the design
 * canvas (Polish › Profile menu): who you are and whether you're working,
 * the personal pages people jump to, quick language and theme switches, and
 * sign out. A dim backdrop covers the page while it's open.
 */
export function ProfileBadge() {
  const { profile } = useProfile()
  const avatarUrl = useAvatarUrl(profile?.photo_path)
  const { attendance, openAttendance } = useJourneyContext()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  useBackHandler(open, () => setOpen(false))
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const { language, setLanguage, t } = useLanguage()
  const { mode, setMode } = useTheme()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // A click anywhere outside the badge and its menu closes it -- the title
    // bar, the tab bar, or the page under the dimmed backdrop.
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [open])

  const name = profile ? displayName(profile.full_name, profile.nickname) : ''
  const initials = name ? initialsOf(name) : ''
  const roleLine = [profile?.role_name, profile?.position].filter(Boolean).join(' · ')
  const working = attendance === 'CLOCKED_IN' && openAttendance
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const avatar = (size: string, text: string) => (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 font-extrabold text-white`}>
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials || <User className="h-4 w-4" aria-hidden />}
      <span className="sr-only">{text}</span>
    </span>
  )

  return (
    <div ref={rootRef} className="relative">
      {/* Portalled to <body>: the title bar's backdrop-blur makes it the containing block for
          `fixed` children, so an in-place backdrop would only cover the bar. It sits under the
          bar (z-10) and tab bar (z-20) so the menu stays on top; clicks on it land here and
          never reach the page underneath. */}
      {open &&
        createPortal(
          <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-[9] animate-fade-in bg-[rgba(8,12,20,.42)]" />,
          document.body
        )}
      <button
        onClick={() => {
          haptic('light')
          setOpen((v) => !v)
        }}
        aria-label={t('profile.accountMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative z-40 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-sm font-extrabold text-white tap-target ${
          open ? 'ring-2 ring-brand-500 ring-offset-[3px] ring-offset-neutral-50 dark:ring-offset-neutral-950' : ''
        }`}
      >
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials || <User className="h-4 w-4" aria-hidden />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('profile.accountMenu')}
          className="absolute right-[-4px] top-full z-40 mt-3 w-[300px] origin-top-right animate-pop-in rounded-2xl border border-neutral-100 bg-white shadow-[0_12px_32px_rgba(8,12,20,.28),0_2px_6px_rgba(8,12,20,.12)]"
        >
          <span aria-hidden className="absolute -top-1.5 right-[18px] h-3 w-3 rotate-45 bg-white" />
          <button role="menuitem" onClick={() => go('/profile')} className="relative flex w-full items-center gap-3 rounded-t-2xl p-3.5 text-left">
            {avatar('h-[46px] w-[46px] text-base', '')}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-extrabold text-neutral-900">{name}</span>
              {roleLine && <span className="block truncate text-xs text-neutral-500">{roleLine}</span>}
              <span className={`mt-1 inline-flex items-center gap-1.5 text-xs font-bold ${working ? 'text-status-working' : 'text-neutral-500'}`}>
                <span className={`h-[7px] w-[7px] rounded-full ${working ? 'bg-status-working' : 'border-2 border-neutral-400'}`} />
                {working ? t('profile.workingSince', { time: formatTime(openAttendance.clock_in_at) }) : t('profile.offShift')}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
          </button>

          <div className="h-px bg-neutral-100" />
          <div className="py-1.5">
            <MenuItem icon={CalendarCheck} label={t('profile.leaveAttendance')} onClick={() => go('/leave')} />
            <MenuItem icon={Briefcase} label={t('nav.trips')} onClick={() => go('/trips')} />
          </div>

          <div className="h-px bg-neutral-100" />
          <div className="flex flex-col gap-2 px-3.5 py-2">
            <SegmentRow
              label={t('profile.language')}
              value={language}
              options={[
                ['en', 'EN'],
                ['km', 'ខ្មែរ'],
              ]}
              onChange={(code) => setLanguage(code as 'en' | 'km')}
            />
            <SegmentRow
              label={t('profile.theme')}
              value={mode}
              options={[
                ['light', t('profile.themeLight')],
                ['dark', t('profile.themeDark')],
                ['system', t('profile.themeAuto')],
              ]}
              onChange={(m) => setMode(m as ThemeMode)}
            />
          </div>

          <div className="h-px bg-neutral-100" />
          <div className="py-1.5">
            <MenuItem icon={Bell} label={t('nav.notifications')} onClick={() => go('/notifications')} />
            <MenuItem icon={Settings} label={t('profile.setting')} onClick={() => go('/settings')} />
          </div>

          <div className="h-px bg-neutral-100" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              haptic('light')
              setLogoutConfirmOpen(true)
            }}
            className="flex min-h-12 w-full items-center gap-3 rounded-b-2xl px-3.5 text-left text-[15px] font-bold text-status-danger"
          >
            <LogOut className="h-[19px] w-[19px]" aria-hidden />
            {t('profile.signOut')}
          </button>
        </div>
      )}

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof User; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} className="flex min-h-[46px] w-full items-center gap-3 px-3.5 text-left text-[15px] font-semibold text-neutral-900">
      <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden />
      {label}
    </button>
  )
}

function SegmentRow({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex min-h-[34px] items-center gap-2.5">
      <span className="flex-1 text-sm font-semibold text-neutral-900">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-[9px] bg-neutral-100 p-0.5">
        {options.map(([k, text]) => {
          const on = k === value
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                haptic('light')
                onChange(k)
              }}
              className={`h-[26px] whitespace-nowrap rounded-[7px] px-2 text-xs ${on ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}
