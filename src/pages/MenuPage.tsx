import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search, Settings, User, X } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove, forYou, hubFunctions, hubSearch } from '@/features/nav/navConfig'
import { useFlexCycle } from '@/features/flex/useFlexCycle'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { useMessages } from '@/features/conversations/MessagesContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { displayName } from '@/lib/displayName'

/**
 * Hub (bottom-bar tab, /menu), grouped by function: the profile, a search
 * that finds any screen by name, the role's "For you" shortcuts, then one
 * card per function (Customers & sales, My day, Leave & days off, Team,
 * Company setup) -- each opens /menu/:fn -- and Account & settings.
 * Only screens the person can use; nothing that's already a tab.
 */
export function MenuPage() {
  const { profile } = useProfile()
  const avatarUrl = useAvatarUrl(profile?.photo_path)
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const flex = useFlexCycle()
  const { group, ctx } = useRoleGroup(!!flex.cycle?.isFlexible)
  const pendingApprovals = usePendingApprovals(canApprove(ctx))
  const { unreadCount } = useNotificationsContext()
  const { unreadCount: unreadMessages } = useMessages()
  const badge = (key: string) => (key === 'approvals' ? pendingApprovals : key === 'messages' ? unreadMessages : key === 'notifications' ? unreadCount : 0)
  const shortcuts = forYou(group, ctx)
  const functions = hubFunctions(group, ctx)
  const results = hubSearch(group, ctx, query)
  const total = functions.reduce((a, f) => a + f.rows.length, 0)

  const name = profile ? displayName(profile.full_name, profile.nickname) : ''
  const roleLine = [profile?.position, profile?.role_name].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <div className="space-y-4 px-4 pb-6 pt-1 md:px-8 md:pt-4">
        <Link to="/profile" className="flex items-center gap-3.5 rounded-2xl bg-white p-3.5 shadow-card">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-[20px] font-bold text-white">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name[0]?.toUpperCase() || <User className="h-6 w-6" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-bold text-neutral-900">{name || '…'}</span>
            {roleLine && <span className="block truncate text-[13px] text-neutral-500">{roleLine}</span>}
          </span>
          <span className="text-xs font-bold text-brand-500">Profile</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>

        <label className={`flex h-11 items-center gap-2.5 rounded-xl border-[1.5px] bg-white px-3.5 ${query ? 'border-brand-500' : 'border-neutral-200 dark:border-neutral-700'}`}>
          <Search className="h-[18px] w-[18px] shrink-0 text-neutral-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the Hub — leave, users, trips…"
            aria-label="Search the Hub"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        {query ? (
          <section className="space-y-1.5">
            <h2 className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
            </h2>
            {results.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-center text-[13.5px] text-neutral-500 shadow-card">Nothing matches. Try another word, or browse the functions.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-card">
                {results.map((r, i) => (
                  <Link key={r.key} to={r.to} className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                    <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white ${r.tone}`}>
                      <r.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900">{r.label}</span>
                      <span className="block truncate text-[12px] text-neutral-500">{t(r.fn.titleKey)}</span>
                    </span>
                    {badge(r.key) > 0 && <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-status-danger px-1.5 text-[12px] font-bold text-white">{badge(r.key)}</span>}
                    <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {shortcuts.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">For you</h2>
                <div className="grid grid-cols-4 gap-2">
                  {shortcuts.map((q) => (
                    <Link key={q.key} to={q.to} className="flex flex-col items-center gap-1.5">
                      <span className={`flex h-[54px] w-[54px] items-center justify-center rounded-2xl text-white ${q.tone}`}>
                        <q.icon className="h-[22px] w-[22px]" aria-hidden />
                      </span>
                      <span className="text-center text-xs font-semibold leading-tight text-neutral-600">{q.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Everything, by function</h2>
              {functions.map((f) => {
                const waiting = f.rows.some((r) => r.key === 'approvals') ? pendingApprovals : 0
                return (
                  <Link key={f.key} to={`/menu/${f.key}`} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-card">
                    <span className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-white ${f.tone}`}>
                      <f.icon className="h-[21px] w-[21px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-base font-extrabold text-neutral-900">{t(f.titleKey)}</span>
                        <span className="text-[12px] font-bold text-neutral-500">{f.rows.length}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">{f.rows.map((r) => r.label).join(' · ')}</span>
                    </span>
                    {waiting > 0 && <span className="shrink-0 rounded-full bg-status-danger px-2 py-0.5 text-[11.5px] font-extrabold text-white">{waiting} waiting</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  </Link>
                )
              })}
            </section>

            <Link to="/menu/account" className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-card">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 dark:bg-neutral-800">
                <Settings className="h-[21px] w-[21px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-extrabold text-neutral-900">{t('nav.account')}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">Language, appearance, help, privacy, log out</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            </Link>

            <p className="px-1 text-center text-xs text-neutral-500">
              {total} screens in {functions.length} functions · Footprints v{__APP_VERSION__}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
