import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, LogOut, Settings, HelpCircle, MapPin, Info, Shield, User, TrendingUp, Truck, Users as UsersIcon, type LucideIcon } from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import { LocationPermissionSheet } from '@/features/location/LocationPermissionSheet'
import { useAuth } from '@/features/auth/AuthContext'
import { useProfile } from '@/features/auth/useProfile'
import { useNotifications } from '@/features/notifications/useNotifications'
import { haptic } from '@/lib/haptic'

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0'

type SheetKey = 'help' | 'location' | 'about' | 'privacy'

/**
 * The field nav's More screen: everywhere else this app's own admin
 * screens live (Fleet/Users, for a field-sales rep who's also a
 * supervisor or super admin, gated the same way they always were) plus
 * Profile, Performance, support info, Settings, and Logout. Deliberately
 * plain -- a flat list, no cards-within-cards.
 */
export function MorePage() {
  const { signOut } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null)
  const isSuperAdmin = profile?.is_super_admin === true
  const { unreadCount } = useNotifications(isSuperAdmin)

  function go(path: string) {
    haptic('light')
    navigate(path)
  }

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
          <Row icon={User} label="Profile" onClick={() => go('/profile')} />
          <Row icon={TrendingUp} label="Performance" onClick={() => go('/performance')} />
          {isSuperAdmin && <Row icon={Truck} label="Fleet" onClick={() => go('/fleet')} />}
          {isSuperAdmin && <Row icon={UsersIcon} label="Users" onClick={() => go('/users')} />}
          {isSuperAdmin && <Row icon={Bell} label="Notifications" badge={unreadCount} onClick={() => go('/notifications')} />}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl2 bg-white shadow-card">
          <Row icon={HelpCircle} label="Help & Support" onClick={() => setOpenSheet('help')} />
          <Row icon={MapPin} label="Location Permission" onClick={() => setOpenSheet('location')} />
          <Row icon={Info} label="About Footprints" onClick={() => setOpenSheet('about')} />
          <Row icon={Shield} label="Privacy" onClick={() => setOpenSheet('privacy')} />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl2 bg-white shadow-card">
          <Row icon={Settings} label="Settings" onClick={() => go('/settings')} />
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

        <p className="mt-6 pb-6 text-center text-xs text-neutral-400">Footprints v{APP_VERSION}</p>
      </div>

      <InfoSheet open={openSheet === 'help'} onClose={() => setOpenSheet(null)} title="Help">
        <p>Need help using Footprints? Contact your supervisor or HIG IT support.</p>
      </InfoSheet>

      <LocationPermissionSheet open={openSheet === 'location'} onClose={() => setOpenSheet(null)} />

      <InfoSheet open={openSheet === 'about'} onClose={() => setOpenSheet(null)} title="About Footprints">
        <p className="font-medium text-neutral-900">Footprints, by HIG</p>
        <p>Plan your day, visit your customers, and track your progress -- all in one place.</p>
        <p className="text-xs text-neutral-400">Version {APP_VERSION}</p>
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

function Row({ icon: Icon, label, badge, onClick }: { icon: LucideIcon; label: string; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target first:border-t-0 dark:border-neutral-800">
      <Icon className="h-5 w-5 text-neutral-400" aria-hidden />
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
    </button>
  )
}
