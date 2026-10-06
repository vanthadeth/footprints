import { Navigate, useParams } from 'react-router-dom'
import { GroupedList, ListRow } from '@/components/GroupedList'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove, hubFunctions } from '@/features/nav/navConfig'
import { useFlexCycle } from '@/features/flex/useFlexCycle'
import { useMessages } from '@/features/conversations/MessagesContext'
import { useLanguage } from '@/i18n/LanguageContext'

const NOTES: Record<string, string> = {
  sell: 'Your customers and selling, and the briefing for every customer.',
  day: 'Your own day: what’s next, messages, where you went and your numbers.',
  time: 'Your own leave first, then what your team is waiting on, then the company rules.',
  team: 'Where your team is and how they’re doing.',
  company: 'What an admin sets once: who works here and what they can do, the rules the app enforces, and system options.',
}

/**
 * One Hub function (/menu/:fn): its screens split into parts -- Mine,
 * Your team, Company (Company setup: People & access, Work rules, System).
 */
export function HubFunctionPage() {
  const { fn } = useParams()
  const { t } = useLanguage()
  const flex = useFlexCycle()
  const { group, ctx, ready } = useRoleGroup(!!flex.cycle?.isFlexible)
  const pendingApprovals = usePendingApprovals(canApprove(ctx))
  const { unreadCount: unreadMessages } = useMessages()
  const badge = (key: string) => (key === 'approvals' ? pendingApprovals : key === 'messages' ? unreadMessages : undefined)
  const f = hubFunctions(group, ctx).find((x) => x.key === fn)

  // Wait for the profile and permissions before deciding the function isn't theirs.
  if (!f) return ready ? <Navigate to="/menu" replace /> : null

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pb-6 pt-3 md:max-w-2xl md:px-8">
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${f.tone}`}>
          <f.icon className="h-6 w-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[22px] font-extrabold text-neutral-900">{t(f.titleKey)}</span>
          <span className="block text-[13px] text-neutral-500">
            {f.rows.length} screen{f.rows.length === 1 ? '' : 's'}
            {f.rows.some((r) => r.key === 'approvals') && pendingApprovals ? ` · ${pendingApprovals} waiting for you` : ''}
          </span>
        </span>
      </div>
      {f.parts.map((p) => (
        <GroupedList key={p.key} title={f.parts.length > 1 ? p.title : undefined}>
          {p.rows.map((r) => (
            <ListRow key={r.key} icon={r.icon} iconBg={r.tone} label={r.label} sublabel={r.sub} to={r.to} badge={badge(r.key)} />
          ))}
        </GroupedList>
      ))}
      <p className="px-1 text-[12px] leading-relaxed text-neutral-500">{NOTES[f.key]}</p>
    </div>
  )
}
