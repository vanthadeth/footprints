import { Moon, Smartphone, Sun } from 'lucide-react'
import { useTheme } from '@/lib/ThemeContext'
import { haptic } from '@/lib/haptic'
import type { ThemeMode } from '@/lib/theme'

const OPTIONS: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'system', label: 'System', icon: Smartphone },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
]

/**
 * The one Appearance control for the whole app -- a 3-way System/Light/Dark
 * segmented pill, the same convention as UsersPage's status filter and
 * FleetPage's tab switcher. Lives in Settings (and the personal-settings
 * sheet MenuPage shows non-admins) rather than a toggle repeated on every
 * screen.
 */
export function AppearanceControl() {
  const { mode, setMode } = useTheme()

  return (
    <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => {
            haptic('light')
            setMode(opt.key)
          }}
          aria-pressed={mode === opt.key}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold tap-target ${
            mode === opt.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          <opt.icon className="h-4 w-4" aria-hidden />
          {opt.label}
        </button>
      ))}
    </div>
  )
}
