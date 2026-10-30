import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Globe, HelpCircle, Info, LogOut, MapPin, Moon, Shield, User } from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import { AppBuildInfo } from '@/components/AppBuildInfo'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { GroupedList, ListRow } from '@/components/GroupedList'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { LocationPermissionSheet } from '@/features/location/LocationPermissionSheet'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useTheme } from '@footprints/shared/lib/ThemeContext'
import { displayName } from '@footprints/shared/lib/displayName'
import type { ThemeMode } from '@footprints/shared/lib/theme'

type SheetKey = 'help' | 'location' | 'about' | 'privacy' | null


/**
 * Account & settings (Hub › Account & settings, /menu/account): the
 * profile, language and appearance, help and privacy, and log out -- moved
 * off the Hub so it only lists screens, grouped by function.
 */
export function AccountPage() {
  const { profile } = useProfile()
  const avatarUrl = useAvatarUrl(profile?.photo_path)
  const { t, language, setLanguage } = useLanguage()
  const { mode, setMode } = useTheme()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  // ?open=help / ?open=privacy (from the Hub's Account & settings) opens that sheet straight away.
  const [params] = useSearchParams()
  const [openSheet, setOpenSheet] = useState<SheetKey>(() => {
    const o = params.get('open')
    return o === 'help' || o === 'privacy' || o === 'about' || o === 'location' ? o : null
  })

  const name = profile ? displayName(profile.full_name, profile.nickname) : ''
  const roleLine = [profile?.position, profile?.role_name].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl lg:max-w-4xl">
      <div className="space-y-5 px-4 pb-6 pt-1 md:px-8 md:pt-4">
        <Link to="/profile" className="flex items-center gap-3.5 rounded-2xl bg-white p-3.5 shadow-card">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-[22px] font-bold text-white">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name[0]?.toUpperCase() || <User className="h-6 w-6" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-bold text-neutral-900">{name || '…'}</span>
            {roleLine && <span className="block truncate text-[13px] text-neutral-500">{roleLine}</span>}
          </span>
          <span className="text-xs font-bold text-brand-500">{t('account.edit')}</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>

        <GroupedList title={t('account.preferences')}>
          <ListRow
            icon={Globe}
            iconBg="bg-brand-600"
            label={t('menu.language')}
            trailing={
              <SegmentedControl
                ariaLabel={t('menu.language')}
                shape="tabs"
                value={language}
                onChange={setLanguage}
                className="w-[128px] shrink-0"
                options={[
                  { value: 'en', label: 'EN' },
                  { value: 'km', label: 'ខ្មែរ' },
                ]}
              />
            }
          />
          <ListRow
            icon={Moon}
            iconBg="bg-neutral-600"
            label={t('menu.appearance')}
            trailing={
              <SegmentedControl<ThemeMode>
                ariaLabel={t('menu.appearance')}
                shape="tabs"
                value={mode}
                onChange={setMode}
                className="w-[176px] shrink-0 [&_button]:px-2"
                options={[
                  { value: 'system', label: t('account.auto') },
                  { value: 'light', label: t('account.light') },
                  { value: 'dark', label: t('account.dark') },
                ]}
              />
            }
          />
        </GroupedList>

        <GroupedList title={t('account.helpPrivacy')}>
          <ListRow icon={HelpCircle} iconBg="bg-brand-500" label={t('account.helpSupport')} onClick={() => setOpenSheet('help')} />
          <ListRow icon={MapPin} iconBg="bg-status-working" label={t('account.locationPermission')} onClick={() => setOpenSheet('location')} />
          <ListRow icon={Shield} iconBg="bg-neutral-600" label={t('account.privacy')} onClick={() => setOpenSheet('privacy')} />
          <ListRow icon={Info} iconBg="bg-earth-500" label={t('account.about')} onClick={() => setOpenSheet('about')} />
        </GroupedList>

        <div className="space-y-2">
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-status-danger text-[15px] font-bold text-white tap-target"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            {t('account.logOut')}
          </button>
          <p className="text-center text-xs text-neutral-500">
            {profile?.email ? t('account.signedInAs', { email: profile.email }) : ''}{t('account.version', { v: __APP_VERSION__ })}
          </p>
        </div>
      </div>

      <InfoSheet open={openSheet === 'help'} onClose={() => setOpenSheet(null)} title={t('account.helpTitle')}>
        <p>{t('account.helpBody')}</p>
      </InfoSheet>

      <LocationPermissionSheet open={openSheet === 'location'} onClose={() => setOpenSheet(null)} />

      <InfoSheet open={openSheet === 'about'} onClose={() => setOpenSheet(null)} title={t('account.about')}>
        <p className="font-medium text-neutral-900">{t('account.aboutBy')}</p>
        <p>{t('account.aboutBody')}</p>
        <AppBuildInfo />
      </InfoSheet>

      <InfoSheet open={openSheet === 'privacy'} onClose={() => setOpenSheet(null)} title={t('account.privacy')}>
        <p>{t('account.privacyBody')}</p>
      </InfoSheet>

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}
