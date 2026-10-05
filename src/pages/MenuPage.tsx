import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, Settings, X } from 'lucide-react'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove, forYou, hubFunctions, hubSearch } from '@/features/nav/navConfig'
import { useFlexCycle } from '@/features/flex/useFlexCycle'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { useMessages } from '@/features/conversations/MessagesContext'
import { useLanguage } from '@/i18n/LanguageContext'

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

  const [openKey, setOpenKey] = useState<string | null | undefined>(undefined)
  // One function open at a time; the one with something waiting starts open.
  const defaultOpen = pendingApprovals > 0 ? (functions.find((f) => f.rows.some((r) => r.key === 'approvals'))?.key ?? null) : null
  const current = openKey === undefined ? defaultOpen : openKey
  const groups = [
    ...functions.map((f) => ({ key: f.key, title: t(f.titleKey), icon: f.icon, rows: f.rows.map((r) => ({ key: r.key, label: r.label, to: r.to })) })),
    {
      key: 'account',
      title: t('nav.account'),
      icon: Settings,
      rows: [
        { key: 'profile', label: t('nav.profile'), to: '/profile' },
        { key: 'account', label: t('nav.account'), to: '/menu/account' },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <div className="space-y-3.5 px-4 pb-6 pt-1.5 md:px-8 md:pt-4">
        <label className={`flex h-11 items-center gap-2 rounded-xl border bg-white px-3 dark:bg-neutral-950 ${query ? 'border-brand-500' : 'border-neutral-300'}`}>
          <Search className="h-[18px] w-[18px] shrink-0 text-neutral-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the Hub — leave, users, trips…"
            aria-label="Search the Hub"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        {query ? (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
              {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
            </h2>
            {results.length === 0 ? (
              <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-500 shadow-card">Nothing matches. Try another word, or browse the functions.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
                {results.map((r, i) => (
                  <Link key={r.key} to={r.to} className={`flex min-h-[52px] items-center gap-3 px-3.5 py-2 ${i ? 'border-t border-neutral-100' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-500">
                      <r.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900">{r.label}</span>
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
            {shortcuts.length > 0 && (
              <section aria-label="For you">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">For you</h2>
                <div className="grid grid-cols-3 gap-2">
                  {shortcuts.map((q) => (
                    <Link key={q.key} to={q.to} className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-100 bg-white px-1.5 pb-3 pt-3.5 shadow-card">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                        <q.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="text-center text-[13px] font-semibold leading-4 text-neutral-900">{q.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Everything, by function">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Everything, by function</h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
                {groups.map((g, i) => {
                  const open = current === g.key
                  const waiting = g.rows.some((r) => r.key === 'approvals') ? pendingApprovals : 0
                  return (
                    <div key={g.key} className={i ? 'border-t border-neutral-100' : ''}>
                      <button
                        type="button"
                        onClick={() => setOpenKey(open ? null : g.key)}
                        aria-expanded={open}
                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${open ? 'bg-neutral-50' : ''}`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-500">
                          <g.icon className="h-[18px] w-[18px]" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-neutral-900">{g.title}</span>
                          <span className="block truncate text-[13px] text-neutral-500">{g.rows.map((r) => r.label).join(' · ')}</span>
                        </span>
                        {waiting > 0 && <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-status-warn/10 px-2 text-xs font-bold text-status-warn">{waiting} waiting</span>}
                        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                      </button>
                      {open && (
                        <div className="bg-neutral-50 pb-2 pl-[62px] pr-3.5">
                          {g.rows.map((r) => (
                            <Link key={r.key} to={r.to} className="flex min-h-11 items-center gap-2.5 border-t border-neutral-100">
                              <span className="min-w-0 flex-1 text-[15px] font-semibold text-neutral-900">{r.label}</span>
                              {badge(r.key) > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-extrabold text-white">{badge(r.key)}</span>}
                              <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <p className="px-1 text-center text-xs text-neutral-500">
              {total} screens in {functions.length} functions · Footprints v{__APP_VERSION__}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
