import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Building2, CalendarDays, ChevronRight, Globe, LogOut, HelpCircle, MapPin, Info, Shield, type LucideIcon } from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import { AppBuildInfo } from '@/components/AppBuildInfo'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { LocationPermissionSheet } from '@/features/location/LocationPermissionSheet'
import { useProfile } from '@/features/auth/useProfile'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { haptic } from '@/lib/haptic'

type SheetKey = 'help' | 'location' | 'about' | 'privacy' | null

const ITEMS: { key: Exclude<SheetKey, null>; icon: LucideIcon; label: string }[] = [
  { key: 'help', icon: HelpCircle, label: 'Help' },
  { key: 'location', icon: MapPin, label: 'Location Permission' },
  { key: 'about', icon: Info, label: 'About Footprints' },
  { key: 'privacy', icon: Shield, label: 'Privacy' },
]

/** Settings has its own destination (the account-menu dropdown's Settings item, /settings) -- this page is everything else. */
export function MenuPage() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [openSheet, setOpenSheet] = useState<SheetKey>(null)
  // Notifications visibility is gated on is_super_admin specifically --
  // that's the flag app.effective_scope() actually keys off of (see the
  // notifications_center migration), not a role_name string check.
  const isSuperAdmin = profile?.is_super_admin === true
  const { unreadCount } = useNotificationsContext()

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
          <button
            onClick={() => {
              haptic('light')
              navigate('/leave')
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target"
          >
            <CalendarDays className="h-5 w-5 text-neutral-400" aria-hidden />
            <span className="flex-1">Leave</span>
            <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
          </button>

          {ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                haptic('light')
                setOpenSheet(item.key)
              }}
              className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target dark:border-neutral-800"
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
          {isSuperAdmin && (
            <button
              onClick={() => {
                haptic('light')
                navigate('/translations')
              }}
              className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target dark:border-neutral-800"
            >
              <Globe className="h-5 w-5 text-neutral-400" aria-hidden />
              <span className="flex-1">Translations</span>
              <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
            </button>
          )}
        </div>

        <button
          onClick={() => {
            haptic('light')
            setLogoutConfirmOpen(true)
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl2 bg-white py-3.5 text-sm font-semibold text-status-danger shadow-card tap-target disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Logout
        </button>

        <p className="mt-6 pb-6 text-center text-xs text-neutral-400">Footprints v{__APP_VERSION__}</p>
      </div>

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

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}
