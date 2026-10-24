import { useEffect, useState } from 'react'
import { Bell, ChevronLeft, ChevronRight, CircleCheck, Clock, EllipsisVertical, Globe, LogOut, Megaphone, Search, Sun, TriangleAlert } from 'lucide-react'
import { badgeText } from './bottomNav'
import { unreadCount, type NotificationItem, type NotificationKind, type Preference } from './appBar'

interface Props {
  /** Tab screens get a large title under a date line; sub screens get a back button. */
  variant?: 'tab' | 'sub'
  title: string
  /** Tab screens: the small date line on the left of the top row. */
  dateLine?: string
  /** Tab screens: the scrolled state, a 56px bar with a compact title and a bottom border. */
  compact?: boolean
  /** Sub screens: one line under the title. */
  subtitle?: string
  /** Sub screens: back button and at most one action. */
  onBack?: () => void
  action?: { kind: 'more' | 'search'; label: string; onClick: () => void }
  /** An amber strip above the bar. */
  offline?: boolean
  /** Tab screens: the profile circle's initials. */
  initials?: string
  /** The bell opens these in a bottom sheet; the badge counts the unread ones. */
  notifications?: NotificationItem[]
  onMarkAllRead?: () => void
  onSeeAll?: () => void
  /** The profile circle opens this menu. */
  profile?: { name: string; role: string }
  preferences?: Record<Preference, boolean>
  onPreferenceChange?: (key: Preference, value: boolean) => void
  onOpenProfile?: () => void
  onLogout?: () => void
  /** `fixed` covers the screen (the app); `absolute` stays inside the nearest positioned parent (previews). */
  overlay?: 'fixed' | 'absolute'
  /** Open a panel on first render (previews, tests). */
  defaultOpen?: 'notifications' | 'profile'
  className?: string
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = { alert: TriangleAlert, announcement: Megaphone, approved: CircleCheck, reminder: Clock }

function BellButton({ count, onClick }: { count: number; onClick?: () => void }) {
  const t = badgeText(count)
  return (
    <button type="button" className="ab-ib" aria-label={t ? `Notifications, ${count} unread` : 'Notifications'} aria-haspopup="dialog" onClick={onClick}>
      <Bell size={24} strokeWidth={1.9} aria-hidden="true" />
      {t && <i className="ab-bd">{t}</i>}
    </button>
  )
}

function Switch({ on, label, icon, onChange }: { on: boolean; label: string; icon: React.ReactNode; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ab-dr" onClick={() => onChange(!on)}>
      <span className="ab-dri">{icon}</span>
      <span className="ab-drl">{label}</span>
      <span className={`ab-sw${on ? ' ab-on' : ''}`}><i /></span>
    </button>
  )
}

/**
 * The bar at the top of a screen. Tab screens: a date line, the bell and
 * the profile circle, then a large title that scrolls away (or the
 * compact 56px bar once scrolled). Sub screens: back, a title with one
 * line under it, and one action. The bell opens a notifications sheet,
 * the profile circle a dropdown with preferences and Log out. Colours come
 * from the --ab-* variables in styles.css (light and dark).
 */
export function AppBar({
  variant = 'tab',
  title,
  dateLine,
  compact = false,
  subtitle,
  onBack,
  action,
  offline = false,
  initials = '',
  notifications,
  onMarkAllRead,
  onSeeAll,
  profile,
  preferences = { khmer: false, dark: false },
  onPreferenceChange,
  onOpenProfile,
  onLogout,
  overlay = 'fixed',
  defaultOpen,
  className = '',
}: Props) {
  const [open, setOpen] = useState<'notifications' | 'profile' | null>(defaultOpen ?? null)
  const items = notifications ?? []
  const unread = unreadCount(items)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const bell = <BellButton count={unread} onClick={() => setOpen('notifications')} />
  const avatar = (
    <button type="button" className="ab-av" aria-label={profile ? `Profile menu, ${profile.name}` : 'Profile menu'} aria-haspopup="menu" onClick={() => setOpen('profile')}>
      {initials}
    </button>
  )

  return (
    <div className={`ab-host ${className}`}>
      {offline && <div className="ab-off" role="status">Offline · changes will sync when you are back</div>}
      {variant === 'tab' && !compact && (
        <header className="ab-bar">
          <div className="ab-row1">
            <span className="ab-dt">{dateLine}</span>
            <span className="ab-acts">{bell}{avatar}</span>
          </div>
          <h1 className="ab-h1">{title}</h1>
        </header>
      )}
      {variant === 'tab' && compact && (
        <header className="ab-bar ab-cmp">
          <span className="ab-ct2">{title}</span>
          <span className="ab-acts">{bell}{avatar}</span>
        </header>
      )}
      {variant === 'sub' && (
        <header className="ab-bar ab-sub">
          <button type="button" className="ab-ib" aria-label="Back" onClick={onBack}>
            <ChevronLeft size={26} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <span className="ab-tt">
            <b>{title}</b>
            {subtitle && <span>{subtitle}</span>}
          </span>
          {action && (
            <span className="ab-acts">
              <button type="button" className="ab-ib" aria-label={action.label} onClick={action.onClick}>
                {action.kind === 'search' ? <Search size={24} strokeWidth={1.9} aria-hidden="true" /> : <EllipsisVertical size={24} strokeWidth={1.9} aria-hidden="true" />}
              </button>
            </span>
          )}
        </header>
      )}

      {open === 'notifications' && (
        <div className={`ab-layer ab-${overlay}`}>
          <button type="button" className="ab-dim" aria-label="Close notifications" onClick={() => setOpen(null)} />
          <div className="ab-sh" role="dialog" aria-label="Notifications">
            <i className="ab-handle" />
            <div className="ab-shh">
              <b>Notifications</b>
              <button type="button" onClick={onMarkAllRead}>Mark all read</button>
            </div>
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind]
              return (
                <div key={n.id} className="ab-ni">
                  <span className={`ab-nic${n.kind === 'alert' ? ' ab-bad' : ''}`}><Icon size={20} strokeWidth={1.9} aria-hidden="true" /></span>
                  <span className="ab-nt"><b>{n.title}</b><span>{n.detail}</span></span>
                  <span className="ab-nw">{n.time}{n.unread && <i className="ab-un" aria-label="Unread" />}</span>
                </div>
              )
            })}
            <button type="button" className="ab-all" onClick={onSeeAll}>See all notifications</button>
          </div>
        </div>
      )}

      {open === 'profile' && (
        <div className={`ab-layer ab-${overlay}`}>
          <button type="button" className="ab-dim ab-light" aria-label="Close menu" onClick={() => setOpen(null)} />
          <div className="ab-dd" role="menu" aria-label="Profile menu">
            <i className="ab-cr" />
            <button type="button" className="ab-dp" onClick={onOpenProfile}>
              <span className="ab-av ab-big">{initials}</span>
              <span className="ab-nt"><b>{profile?.name}</b><span>{profile?.role} · View profile</span></span>
              <ChevronRight size={18} strokeWidth={1.9} aria-hidden="true" />
            </button>
            <div className="ab-sec"><span>Preferences</span><i /></div>
            <Switch on={preferences.khmer} label="Khmer language" icon={<Globe size={20} strokeWidth={1.9} aria-hidden="true" />} onChange={(v) => onPreferenceChange?.('khmer', v)} />
            <Switch on={preferences.dark} label="Dark mode" icon={<Sun size={20} strokeWidth={1.9} aria-hidden="true" />} onChange={(v) => onPreferenceChange?.('dark', v)} />
            <div className="ab-dsep" />
            <button type="button" className="ab-dr ab-out" onClick={onLogout}>
              <span className="ab-dri"><LogOut size={20} strokeWidth={1.9} aria-hidden="true" /></span>
              <span className="ab-drl">Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
