import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { displayName } from '@/lib/displayName'
import {
  FNS,
  GROUPS,
  SCOPE_LABEL,
  deriveState,
  describeGrant,
  detailChanges,
  expiryToUntil,
  fnPairs,
  grantSources,
  mergeOverrides,
  personChanges,
  untilToExpiry,
  type FnKey,
  type FnMeta,
  type FnState,
  type Grant,
  type Scope,
} from './catalog'
import { Avatar, GroupCard, LocationPicker, SaveBar } from './PermissionBits'
import { clockSummary, errorText, sameIds } from './permissionText'
import { permissionsService, type Direction, type PermissionsData, type PersonRow } from './permissionsService'

type Mode = 'role' | 'allow' | 'deny'

interface Choice {
  mode: Mode
  scope: Scope | null
  note: string
  until: string
}

interface PersonDraft {
  fns: Record<FnKey, Choice>
  clock: Record<Direction, string[] | null>
}

interface PersonContext {
  roleRows: PermissionsData['rolePerms']
  overrides: PermissionsData['overrides']
  effective: ReturnType<typeof mergeOverrides>
  roleState: FnState
  effState: FnState
  saved: PersonDraft
  roleClock: Record<Direction, string[]>
}

function personContext(data: PermissionsData, person: PersonRow, now: Date): PersonContext {
  const roleRows = data.rolePerms.filter((r) => r.role_id === person.role_id)
  const overrides = data.overrides.filter((o) => o.user_id === person.id)
  const live = overrides.filter((o) => !o.expires_at || new Date(o.expires_at) > now)
  const effective = mergeOverrides(roleRows, overrides, now)
  const roleState = deriveState(roleRows)
  const effState = deriveState(effective)
  const sources = grantSources(roleRows, effective)
  const fns = Object.fromEntries(
    FNS.map((f) => {
      const eff = effState[f.key]
      const o = live.find((r) => fnPairs(f.key).some((p) => p.module_key === r.module_key && p.action === r.action))
      const mode: Mode = sources[f.key] === 'role' ? 'role' : eff ? 'allow' : 'deny'
      return [f.key, { mode, scope: eff?.scope ?? null, note: o?.note ?? '', until: o?.expires_at ? expiryToUntil(o.expires_at) : '' }]
    })
  ) as Record<FnKey, Choice>
  const rule = (who: 'role' | 'user', dir: Direction) =>
    data.clockRules.find((r) => r.direction === dir && (who === 'role' ? r.role_id === person.role_id && person.role_id : r.user_id === person.id))
  return {
    roleRows,
    overrides: live,
    effective,
    roleState,
    effState,
    saved: { fns, clock: { in: rule('user', 'in')?.location_ids ?? null, out: rule('user', 'out')?.location_ids ?? null } },
    roleClock: { in: rule('role', 'in')?.location_ids ?? [], out: rule('role', 'out')?.location_ids ?? [] },
  }
}

const sameChoice = (a: Choice, b: Choice) =>
  a.mode === b.mode && (a.mode !== 'allow' || a.scope === b.scope) && (a.mode === 'role' || (a.note === b.note && a.until === b.until))

function countChanges(ctx: PersonContext, d: PersonDraft): number {
  return FNS.filter((f) => !sameChoice(ctx.saved.fns[f.key], d.fns[f.key])).length + (['in', 'out'] as const).filter((dir) => !sameIds(ctx.saved.clock[dir], d.clock[dir])).length
}

function grantFor(fn: FnMeta, c: Choice, roleGrant: Grant): Grant {
  if (c.mode === 'role') return roleGrant
  if (c.mode === 'deny') return null
  return { scope: fn.scopes ? (c.scope ?? fn.scopes[0]!) : null }
}

/** By person: follow the role, or allow / deny a function for one person, with a reason and an end date. */
export function PersonTab({
  data,
  onOpenRole,
  onSaved,
}: {
  data: PermissionsData
  onOpenRole: (roleId: string) => void
  onSaved: (message: string) => void
}) {
  const now = useMemo(() => new Date(), [])
  const people = useMemo(() => data.people.filter((p) => !p.is_super_admin), [data.people])
  const [query, setQuery] = useState('')
  const [personId, setPersonId] = useState<string | null>(people[0]?.id ?? null)
  const [drafts, setDrafts] = useState<Record<string, PersonDraft>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overrideCount = (id: string) => data.overrides.filter((o) => o.user_id === id && (!o.expires_at || new Date(o.expires_at) > now)).length
  const shown = people.filter((p) => `${p.full_name} ${p.nickname ?? ''} ${p.position ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const person = people.find((p) => p.id === personId) ?? null
  const ctx = useMemo(() => (person ? personContext(data, person, now) : null), [data, person, now])
  const roleName = (id: string | null) => data.roles.find((r) => r.id === id)?.name ?? 'No role'
  const total = Object.entries(drafts).reduce((n, [id, d]) => {
    const p = people.find((x) => x.id === id)
    return p ? n + countChanges(personContext(data, p, now), d) : n
  }, 0)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const [id, d] of Object.entries(drafts)) {
        const p = people.find((x) => x.id === id)
        if (!p) continue
        const c = personContext(data, p, now)
        const next = Object.fromEntries(FNS.map((f) => [f.key, grantFor(f, d.fns[f.key], c.roleState[f.key])])) as FnState
        const meta = Object.fromEntries(
          FNS.filter((f) => d.fns[f.key].mode !== 'role').map((f) => [
            f.key,
            { note: d.fns[f.key].note.trim() || null, expires_at: d.fns[f.key].until ? untilToExpiry(d.fns[f.key].until) : null },
          ])
        )
        const rows = personChanges(c.roleRows, c.effective, next, meta)
        rows.push(...detailChanges(c.overrides, Object.keys(meta) as FnKey[], meta, rows))
        if (rows.length) await permissionsService.setUserOverrides(id, rows)
        for (const dir of ['in', 'out'] as const) {
          if (!sameIds(c.saved.clock[dir], d.clock[dir])) await permissionsService.setClockRule({ userId: id }, dir, d.clock[dir])
        }
      }
      setDrafts({})
      onSaved('Saved. Their app picks up the change the next time it refreshes.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3.5">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 shadow-card">
        <Search className="h-4 w-4 text-neutral-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
        {shown.map((p) => {
          const name = displayName(p.full_name, p.nickname)
          const n = overrideCount(p.id)
          const active = p.id === personId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersonId(p.id)}
              aria-pressed={active}
              className={`relative flex w-[74px] shrink-0 flex-col items-center gap-1 rounded-2xl border bg-white px-1 py-2.5 ${active ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-200 dark:border-neutral-800'}`}
            >
              <span className="relative">
                <Avatar name={p.full_name} className="h-10 w-10 text-sm" />
                {n > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-visiting px-1 text-[10px] font-bold text-white">
                    {n}
                  </span>
                )}
                {drafts[p.id] && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />}
              </span>
              <span className="w-full truncate text-center text-xs font-bold text-neutral-800">{name.split(' ')[0]}</span>
            </button>
          )
        })}
        {shown.length === 0 && <p className="py-4 text-sm text-neutral-500">No one matches “{query}”.</p>}
      </div>

      {person && ctx && (
        <PersonEditor
          key={person.id}
          person={person}
          ctx={ctx}
          draft={drafts[person.id] ?? ctx.saved}
          roleName={roleName(person.role_id)}
          overrides={overrideCount(person.id)}
          data={data}
          onChange={(d) => setDrafts((all) => ({ ...all, [person.id]: d }))}
          onOpenRole={() => person.role_id && onOpenRole(person.role_id)}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      <p className="px-1 text-xs text-neutral-500">Super Admins aren’t listed: they can always do everything.</p>

      <SaveBar count={total} saving={saving} onSave={save} onDiscard={() => setDrafts({})} />
    </div>
  )
}

function PersonEditor({
  person,
  ctx,
  draft,
  roleName,
  overrides,
  data,
  onChange,
  onOpenRole,
}: {
  person: PersonRow
  ctx: PersonContext
  draft: PersonDraft
  roleName: string
  overrides: number
  data: PermissionsData
  onChange: (d: PersonDraft) => void
  onOpenRole: () => void
}) {
  const setChoice = (fn: FnKey, patch: Partial<Choice>) => onChange({ ...draft, fns: { ...draft.fns, [fn]: { ...draft.fns[fn], ...patch } } })
  const setClock = (dir: Direction, ids: string[] | null) => onChange({ ...draft, clock: { ...draft.clock, [dir]: ids } })
  const effClock = { in: draft.clock.in ?? ctx.roleClock.in, out: draft.clock.out ?? ctx.roleClock.out }
  const [placesOpen, setPlacesOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card">
        <Avatar name={person.full_name} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold text-neutral-900">{displayName(person.full_name, person.nickname)}</p>
          <p className="truncate text-[13px] text-neutral-500">
            {[roleName, person.position, overrides ? `${overrides} override${overrides === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {person.role_id && (
          <button type="button" onClick={onOpenRole} className="shrink-0 text-[13px] font-bold text-brand-600 tap-target">
            Role rules →
          </button>
        )}
      </div>

      {GROUPS.map((g) => (
        <GroupCard key={g.name} title={g.name}>
          {g.fns.map((fn) => {
            const c = draft.fns[fn.key]
            const roleGrant = ctx.roleState[fn.key]
            const grant = grantFor(fn, c, roleGrant)
            const override = c.mode !== 'role'
            const roleText = describeGrant(fn, roleGrant)
            return (
              <div key={fn.key} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-[15px] font-bold text-neutral-900">{fn.label}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      override
                        ? 'bg-status-visiting/10 text-status-visiting'
                        : grant
                          ? 'bg-status-working/10 text-status-working'
                          : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {grant ? 'Allowed' : 'Not allowed'}
                    {override && ' · override'}
                  </span>
                </div>
                <SegmentedControl<Mode>
                  ariaLabel={`${fn.label} for ${person.full_name}`}
                  shape="tabs"
                  className="mt-2"
                  value={c.mode}
                  onChange={(mode) => setChoice(fn.key, { mode, scope: mode === 'allow' ? (c.scope ?? roleGrant?.scope ?? fn.scopes?.[0] ?? null) : c.scope })}
                  options={[
                    { value: 'role', label: 'Use role' },
                    { value: 'allow', label: 'Allow' },
                    { value: 'deny', label: 'Deny' },
                  ]}
                />
                {c.mode === 'allow' && fn.scopes && fn.scopes.length > 1 && (
                  <SegmentedControl<Scope>
                    ariaLabel={`${fn.label} scope`}
                    shape="tabs"
                    className="mt-2"
                    value={c.scope ?? fn.scopes[0]!}
                    onChange={(scope) => setChoice(fn.key, { scope })}
                    options={fn.scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
                  />
                )}
                <p className="mt-1.5 text-[13px] text-neutral-500">
                  {override
                    ? `Override: ${describeGrant(fn, grant)} (role: ${roleText.toLowerCase()})`
                    : `From ${roleName}: ${fn.locations && roleGrant ? clockSummary(ctx.roleClock, data.locations) : roleText}`}
                </p>
                {override && (
                  <div className="mt-2 space-y-2 rounded-xl bg-status-visiting/5 p-2.5">
                    <input
                      value={c.note}
                      onChange={(e) => setChoice(fn.key, { note: e.target.value })}
                      placeholder="Reason (optional), e.g. covering calls while Dara is on leave"
                      className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-neutral-700"
                    />
                    <label className="flex items-center gap-2 text-[13px] text-neutral-600">
                      Until
                      <input
                        type="date"
                        value={c.until}
                        onChange={(e) => setChoice(fn.key, { until: e.target.value })}
                        className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-700"
                      />
                      <span className="text-xs text-neutral-500">{c.until ? 'then back to the role' : 'no end date'}</span>
                    </label>
                  </div>
                )}
                {fn.locations &&
                  grant &&
                  (placesOpen || draft.clock.in !== null || draft.clock.out !== null ? (
                    <>
                      <LocationPicker value={draft.clock} onChange={setClock} locations={data.locations} allowInherit inheritLabel="Use role" />
                      <p className="mt-1.5 text-[13px] text-neutral-500">For {displayName(person.full_name, person.nickname).split(' ')[0]}: {clockSummary(effClock, data.locations)}</p>
                    </>
                  ) : (
                    <button type="button" onClick={() => setPlacesOpen(true)} className="mt-1.5 text-[13px] font-bold text-brand-600 tap-target">
                      Set clock places for this person
                    </button>
                  ))}
              </div>
            )
          })}
        </GroupCard>
      ))}
    </>
  )
}
