import { useState } from 'react'
import { ChevronRight, LogOut, Settings, HelpCircle, MapPin, Info, Shield } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/features/auth/AuthContext'
import { haptic } from '@/lib/haptic'

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0'

const ITEMS = [
  { icon: Settings, label: 'Settings' },
  { icon: HelpCircle, label: 'Help' },
  { icon: MapPin, label: 'Location Permission' },
  { icon: Info, label: 'About Footprints' },
  { icon: Shield, label: 'Privacy' },
]

export function MenuPage() {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <PageHeader title="Menu" />

      <div className="px-4 md:px-8">
        <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
          {ITEMS.map((item, i) => (
            <button
              key={item.label}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target ${
                i > 0 ? 'border-t border-neutral-100' : ''
              }`}
            >
              <item.icon className="h-5 w-5 text-neutral-400" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
            </button>
          ))}
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
    </div>
  )
}
