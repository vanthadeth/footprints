import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useAuth } from '@/features/auth/AuthContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { haptic } from '@/lib/haptic'

/**
 * Shared "are you sure" step before actually signing out -- used from
 * ProfileBadge, ProfilePage, MenuPage, and MorePage so there's one place
 * that owns the confirm copy and the signOut call, matching the
 * BottomSheet confirm pattern JourneyTimeline already uses for check-out
 * and void-visit. No need to reset `signingOut` or close the sheet after
 * a successful sign-out -- every call site lives behind RequireAuth, so
 * `session` flipping to null unmounts this whole tree via its redirect.
 */
export function LogoutConfirmSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useAuth()
  const { t } = useLanguage()
  const [signingOut, setSigningOut] = useState(false)

  async function handleConfirm() {
    haptic('light')
    setSigningOut(true)
    await signOut()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t('profile.logoutConfirmTitle')}>
      <div className="p-4">
        <p className="text-sm text-neutral-600">{t('profile.logoutConfirmBody')}</p>
        <button
          onClick={handleConfirm}
          disabled={signingOut}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-status-danger py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
        >
          {signingOut && <Loader2 className="h-4 w-4 animate-spin" />}
          {signingOut ? t('profile.loggingOut') : t('profile.logoutConfirmYes')}
        </button>
        <button
          onClick={onClose}
          disabled={signingOut}
          className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-neutral-500 tap-target disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
      </div>
    </BottomSheet>
  )
}
