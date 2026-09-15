import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Building2, ChevronRight, LogOut, Settings, HelpCircle, MapPin, Info, Shield } from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import { AppearanceControl } from '@/components/AppearanceControl'
import { AppBuildInfo } from '@/components/AppBuildInfo'
import { LocationPermissionSheet } from '@/features/location/LocationPermissionSheet'
import { useAuth } from '@/features/auth/AuthContext'
import { useProfile } from '@/features/auth/useProfile'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { haptic } from '@/lib/haptic'

type SheetKey = 'settings' | 'help' | 'location' | 'about' | 'privacy' | null

const ITEMS: { key: Exclude<SheetKey, null>; icon: typeof Settings; label: string }[] = [
  { key: 'settings', icon: Settings, label: 'Settings' },
  { key: 'help', icon: HelpCircle, label: 'Help' },
  { key: 'location', icon: MapPin, label: 'Location Permission' },
  { key: 'about', icon: Info, label: 'About Footprints' },
  { key: 'privacy', icon: Shield, label: 'Privacy' },
]

export function MenuPage() {
  const { signOut } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [openSheet, setOpenSheet] = useState<SheetKey>(null)
  const isSystemAdmin = profile?.role_name === 'System Admin'
  // Notifications visibility is gated on is_super_admin specifically --
  // that's the flag app.effective_scope() actually keys off of (see the
  // notifications_center migration), not the role_name string check above.
  const isSuperAdmin = profile?.is_super_admin === true
  const { unreadCount } = useNotificationsContext()

  function handleItemPress(key: Exclude<SheetKey, null>) {
    // A System Admin gets the real global-settings screen; everyone else
    // still sees the placeholder sheet below.
    if (key === 'settings' && isSystemAdmin) {
      navigate('/settings')
      return
    }
    setOpenSheet(key)
  }

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
          {ITEMS.map((item, i) => (
            <button
              key={item.label}
              onClick={() => handleItemPress(item.key)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target ${
                i > 0 ? 'border-t border-neutral-100' : ''
              }`}
            >
              <item.icon className="h-5 w-5 text-neutral-400" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
            </button>
          ))}
          {isSuperAdmin && (
            <button
              onClick={() => {
                haptic('light')
                navigate('/notifications')
              }}
              className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target dark:border-neutral-800"
            >
              <Bell className="h-5 w-5 text-neutral-400" aria-hidden />
              <span className="flex-1">Notifications</span>
              {!!unreadCount && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-semibold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => {
                haptic('light')
                navigate('/locations')
              }}
              className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target dark:border-neutral-800"
            >
              <Building2 className="h-5 w-5 text-neutral-400" aria-hidden />
              <span className="flex-1">Locations</span>
              <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
            </button>
          )}
        </div>

        <button
          disabled={signingOut}
          onClick={async () => {
            haptic('light')
            setSigningOut(true)
            await signOut()
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl2 bg-white py-3.5 text-sm font-semibold text-status-danger shadow-card tap-target disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {signingOut ? 'Logging out…' : 'Logout'}
        </button>

        <p className="mt-6 pb-6 text-center text-xs text-neutral-400">Footprints v{__APP_VERSION__}</p>
      </div>

      <InfoSheet open={openSheet === 'settings'} onClose={() => setOpenSheet(null)} title="Settings">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Appearance</p>
        <AppearanceControl />
      </InfoSheet>

      <InfoSheet open={openSheet === 'help'} onClose={() => setOpenSheet(null)} title="Help">
        <p>Need help using Footprints? Contact your supervisor or HIG IT support.</p>
      </InfoSheet>

      <LocationPermissionSheet open={openSheet === 'location'} onClose={() => setOpenSheet(null)} />

      <InfoSheet open={openSheet === 'about'} onClose={() => setOpenSheet(null)} title="About Footprints">
        <p className="font-medium text-neutral-900">Footprints, by HIG</p>
        <p>Journal your sales journey — attendance, customer visits, and your working day, all in one place.</p>
        <AppBuildInfo />
      </InfoSheet>

      <InfoSheet open={openSheet === 'privacy'} onClose={() => setOpenSheet(null)} title="Privacy">
        <p>
          Footprints records your clock-in/out selfies, GPS location, and customer visit activity as part of your
          employment with HIG. This data is visible to you, your supervisors, and system administrators, and is used
          only for attendance verification, visit tracking, and management reporting.
        </p>
      </InfoSheet>
    </div>
  )
}
