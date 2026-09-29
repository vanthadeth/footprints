import { useMemo, useState } from 'react'
import { Check, Minus } from 'lucide-react'
import { displayName } from '@/lib/displayName'
import { formatDate } from '@/lib/datetime'
import { FNS, FN_BY_KEY, GROUPS, describeGrant, expiryToUntil, whoCan, type FnKey } from './catalog'
import { Chip, GroupCard } from './PermissionBits'
import type { PermissionsData } from './permissionsService'

/** Who can…: pick a function, see which roles and which individual exceptions have it. */
export function WhoTab({ data }: { data: PermissionsData }) {
  const [fnKey, setFnKey] = useState<FnKey>('leave_approve')
  const fn = FN_BY_KEY[fnKey]
  const group = GROUPS.find((g) => g.fns.some((f) => f.key === fnKey))!.name
  const people = useMemo(() => data.people.filter((p) => !p.is_super_admin), [data.people])
  const who = useMemo(() => whoCan(fnKey, data.roles, people, data.rolePerms, data.overrides), [fnKey, data, people])
  const allowedRoles = who.roles.filter((r) => r.grant).length

  return (
    <div className="space-y-3.5">
      <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Who can…</p>
      <div className="flex flex-wrap gap-1.5">
        {FNS.map((f) => (
          <Chip key={f.key} active={f.key === fnKey} onClick={() => setFnKey(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="rounded-2xl bg-brand-900 p-4 text-white shadow-card">
        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-100">{group}</p>
        <p className="mt-1 text-xl font-bold">{fn.label}</p>
        <p className="text-[13px] text-brand-100">{fn.help}</p>
        <p className="mt-3 text-[15px] font-semibold">
          <span className="text-[28px] font-extrabold">{who.allowedPeople}</span> {who.allowedPeople === 1 ? 'person' : 'people'} · {allowedRoles} of{' '}
          {who.roles.length} roles
        </p>
      </div>

      <GroupCard title="By role">
        {who.roles.map(({ role, grant, people: n }) => (
          <div key={role.id} className="flex items-center gap-3 py-2.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${grant ? 'bg-status-working/10 text-status-working dark:text-emerald-300' : 'bg-neutral-100 text-neutral-400'}`}
            >
              {grant ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className={`text-[15px] font-bold ${grant ? 'text-neutral-900' : 'text-neutral-400'}`}>
                {role.name} <span className="text-xs font-medium text-neutral-400">{n} {n === 1 ? 'person' : 'people'}</span>
              </p>
              <p className={`text-[13px] ${grant ? 'text-neutral-500' : 'text-neutral-400'}`}>{describeGrant(fn, grant)}</p>
            </div>
          </div>
        ))}
      </GroupCard>

      <GroupCard title="Individual exceptions">
        {who.exceptions.length === 0 ? (
          <p className="py-2.5 text-sm text-neutral-600">No one has an exception — everyone follows their role.</p>
        ) : (
          who.exceptions.map((e) => (
            <div key={e.person.id} className="py-2.5">
              <p className="text-[15px] font-bold text-neutral-900">{displayName(e.person.full_name, e.person.nickname)}</p>
              <p className="text-[13px] text-neutral-500">
                {e.grant ? describeGrant(fn, e.grant) : 'Denied'} · role: {describeGrant(fn, e.roleGrant).toLowerCase()}
              </p>
              {(e.note || e.expires_at) && (
                <p className="mt-1 rounded-lg bg-status-visiting/5 px-2.5 py-1.5 text-xs text-neutral-600 dark:bg-violet-500/10">
                  {e.note && `“${e.note}”`}
                  {e.note && e.expires_at && ' · '}
                  {e.expires_at && <span className="font-semibold text-status-visiting dark:text-violet-300">Until {formatDate(`${expiryToUntil(e.expires_at)}T12:00:00+07:00`)}</span>}
                </p>
              )}
            </div>
          ))
        )}
      </GroupCard>

      <p className="px-1 text-xs text-neutral-500">Super Admins aren’t listed: they can always do everything.</p>
    </div>
  )
}
