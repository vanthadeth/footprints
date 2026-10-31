import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search, Settings, X } from 'lucide-react'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove, forYou, hubFunctions, hubSearch, rowLabel, rowShort } from '@/features/nav/navConfig'
import { AttendanceHubCard } from '@/features/attendanceSummary/AttendanceHubCard'
import { useFlexProgress } from '@/features/flex/useFlexProgress'
import { useMessages } from '@/features/conversations/MessagesContext'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { displayName } from '@footprints/shared/lib/displayName'
import { NeedsYouCard } from '@/features/nav/NeedsYouCard'
import { useNeedsYou } from '@/features/nav/useNeedsYou'
import { needsYouLines } from '@/features/nav/needsYou'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'

/**
 * Hub (bottom-bar tab, /menu), grouped by function as on the design canvas
 * (Polish › Hub): a search that finds any screen by name, the role's "For
 * you" shortcuts, then one accordion of functions (Customers & sales, My
 * day, Leave & days off, Team, Company setup, Account & settings) that
 * opens in place, one at a time. The profile lives behind the title-bar badge.
 * Only screens the person can use; nothing that's already a tab.
 */
export function MenuPage() {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const flex = useFlexProgress()
  const { group, ctx } = useRoleGroup(!!flex.progress?.isFlexible)
  const pendingApprovals = usePendingApprovals(canApprove(ctx))
  const { unreadCount: unreadMessages } = useMessages()
  const badge = (key: string) => (key === 'approvals' ? pendingApprovals : key === 'messages' ? unreadMessages : 0)
  // The attendance shortcut is a card of its own (this week's numbers); the other shortcuts stay tiles.
  const hasAttendanceCard = forYou(group, ctx).some((r) => r.key === 'attendanceAll')
  const shortcuts = forYou(group, ctx, { skip: hasAttendanceCard ? ['attendanceAll'] : [] })
  const functions = hubFunctions(group, ctx)
  const results = hubSearch(group, ctx, query, t)

  const { profile } = useProfile()
  const needsData = useNeedsYou(group, canApprove(ctx))
  const needs = useMemo(() => needsYouLines(group, needsData, t), [group, needsData, t])
  const groups = [
    ...functions.map((f) => ({
      key: f.key,
      to: `/menu/${f.key}`,
      tone: f.tone,
      title: t(f.titleKey),
      icon: f.icon,
      sub: f.rows.map((r) => rowShort(r, t)).join(' · '),
      rows: f.rows.map((r) => ({ key: r.key, label: rowLabel(r, t), to: r.to })),
    })),
    {
      key: 'account',
      to: '/menu/account',
      tone: 'bg-neutral-600',
      title: t('nav.account'),
      icon: Settings,
      sub: t('menu.accountSub'),
      rows: [
        { key: 'language', label: t('menu.language'), to: '/menu/account' },
        { key: 'appearance', label: t('menu.appearance'), to: '/menu/account' },
        { key: 'help', label: t('menu.help'), to: '/menu/account?open=help' },
        { key: 'privacy', label: t('menu.privacy'), to: '/menu/account?open=privacy' },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl lg:max-w-4xl">
      <div className="space-y-3.5 px-4 pb-6 pt-1.5 md:px-8 md:pt-4">
        {profile && (
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            {profile.role_name && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">{profile.role_name}</span>}
            <span className="text-[13px] text-neutral-500">{displayName(profile.full_name, profile.nickname)}</span>
          </div>
        )}
        <label className={`flex h-11 items-center gap-2 rounded-xl border bg-white px-3 dark:bg-neutral-950 ${query ? 'border-brand-500' : 'border-neutral-300'}`}>
          <Search className="h-[18px] w-[18px] shrink-0 text-neutral-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('menu.searchPlaceholder')}
            aria-label={t('menu.searchAria')}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
          />
          {query && (
            <button type="button" aria-label={t('menu.clearSearch')} onClick={() => setQuery('')} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        {query ? (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
              {t(results.length === 1 ? 'menu.resultOne' : 'menu.resultMany', { n: results.length, q: query.trim() })}
            </h2>
            {results.length === 0 ? (
              <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-500 shadow-card">{t('menu.noMatch')}</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
                {results.map((r, i) => (
                  <Link key={r.key} to={r.to} className={`flex min-h-[52px] items-center gap-3 px-3.5 py-2 ${i ? 'border-t border-neutral-100' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-500">
                      <r.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900">{rowLabel(r, t)}</span>
                      <span className="block truncate text-xs text-neutral-500">{t(r.fn.titleKey)}</span>
                    </span>
                    {badge(r.key) > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-extrabold text-white">{badge(r.key)}</span>}
                    <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <NeedsYouCard title={t(group === 'field' || group === 'office' ? 'hubNeeds.today' : 'hubNeeds.needs')} lines={needs} />

            {(shortcuts.length > 0 || hasAttendanceCard) && (
              <section aria-label={t('menu.forYou')} className="space-y-2.5">
                <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('menu.forYou')}</h2>
                {hasAttendanceCard && <AttendanceHubCard />}
                {shortcuts.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {shortcuts.map((q) => (
                      <Link key={q.key} to={q.to} className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-100 bg-white px-1.5 pb-3 pt-3.5 shadow-card">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                          <q.icon className="h-5 w-5" aria-hidden />
                        </span>
                        <span className="text-center text-[13px] font-semibold leading-4 text-neutral-900">{rowLabel(q, t)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section aria-label={t('menu.everything')}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{t('menu.everything')}</h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
                {groups.map((g, i) => {
                  const waiting = g.rows.some((r) => r.key === 'approvals') ? pendingApprovals : 0
                  return (
                    <Link key={g.key} to={g.to} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${g.tone}`}>
                        <g.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-neutral-900">{g.title}</span>
                        <span className="block text-[13px] leading-snug text-neutral-500">{g.sub}</span>
                      </span>
                      {waiting > 0 && <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-status-warn/10 px-2 text-xs font-bold text-status-warn">{t('menu.waiting', { n: waiting })}</span>}
                      {g.key !== 'account' && <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-neutral-100 px-1.5 text-xs font-bold text-neutral-500 dark:bg-neutral-800">{g.rows.length}</span>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                    </Link>
                  )
                })}
              </div>
            </section>

          </>
        )}
      </div>
    </div>
  )
}
