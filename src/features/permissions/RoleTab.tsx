import { useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import {
  FN_BY_KEY,
  GROUPS,
  SCOPE_LABEL,
  changedFns,
  deriveState,
  describeGrant,
  heldOnBy,
  normalize,
  roleChanges,
  sameGrant,
  type FnKey,
  type FnState,
  type Scope,
} from './catalog'
import { Chip, GroupCard, LocationPicker, SaveBar } from './PermissionBits'
import { clockSummary, errorText, sameIds, type ClockIds } from './permissionText'
import { permissionsService, type Direction, type PermissionsData } from './permissionsService'

interface RoleDraft {
  state: FnState
  clock: ClockIds
}

function savedRole(data: PermissionsData, roleId: string): RoleDraft {
  const rules = data.clockRules.filter((r) => r.role_id === roleId)
  const ids = (dir: Direction) => rules.find((r) => r.direction === dir)?.location_ids ?? []
  return { state: deriveState(data.rolePerms.filter((r) => r.role_id === roleId)), clock: { in: ids('in'), out: ids('out') } }
}

function draftChanges(saved: RoleDraft, draft: RoleDraft): number {
  return changedFns(saved.state, draft.state).length + (['in', 'out'] as const).filter((d) => !sameIds(saved.clock[d], draft.clock[d])).length
}

/** By role: one switch per design function, with Self / Team / All where it applies, and clock-in/out places. */
export function RoleTab({
  data,
  roleId,
  onRole,
  onSaved,
}: {
  data: PermissionsData
  roleId: string
  onRole: (id: string) => void
  onSaved: (message: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, RoleDraft>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const role = data.roles.find((r) => r.id === roleId) ?? data.roles[0]
  const saved = useMemo(() => (role ? savedRole(data, role.id) : null), [data, role])
  if (!role || !saved) return <p className="px-1 text-sm text-neutral-500">No roles yet.</p>
  const draft = drafts[role.id] ?? saved

  const total = Object.entries(drafts).reduce((n, [id, d]) => n + draftChanges(savedRole(data, id), d), 0)
  const people = data.people.filter((p) => p.role_id === role.id && !p.is_super_admin).length
  const allowed = Object.values(draft.state).filter(Boolean).length

  const update = (next: RoleDraft) => setDrafts((d) => ({ ...d, [role.id]: next }))
  const setGrant = (fn: FnKey, on: boolean, scope?: Scope) => {
    const meta = FN_BY_KEY[fn]
    const grant = on ? { scope: meta.scopes ? (scope ?? draft.state[fn]?.scope ?? meta.scopes[0]) : null } : null
    update({ ...draft, state: normalize({ ...draft.state, [fn]: grant }) })
  }
  const setClock = (dir: Direction, ids: string[] | null) => update({ ...draft, clock: { ...draft.clock, [dir]: ids ?? [] } })

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const [id, d] of Object.entries(drafts)) {
        const before = savedRole(data, id)
        const rows = roleChanges(
          data.rolePerms.filter((r) => r.role_id === id),
          d.state
        )
        if (rows.length) await permissionsService.setRolePermissions(id, rows)
        for (const dir of ['in', 'out'] as const) {
          if (!sameIds(before.clock[dir], d.clock[dir])) await permissionsService.setClockRule({ roleId: id }, dir, d.clock[dir].length ? d.clock[dir] : null)
        }
      }
      setDrafts({})
      onSaved('Saved. People pick up the change the next time the app refreshes.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap gap-1.5">
        {data.roles.map((r) => (
          <Chip key={r.id} active={r.id === role.id} onClick={() => onRole(r.id)}>
            {r.name}
            {drafts[r.id] && draftChanges(savedRole(data, r.id), drafts[r.id]!) > 0 && <span className="ml-1 text-brand-500">•</span>}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3.5 dark:bg-brand-900/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 dark:bg-neutral-900">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold text-neutral-900">{role.name}</p>
          <p className="text-[13px] text-neutral-500">
            {people} {people === 1 ? 'person' : 'people'} · {allowed} of {Object.keys(draft.state).length} functions allowed
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      {GROUPS.map((g) => (
        <GroupCard key={g.name} title={g.name} trailing={`${g.fns.filter((f) => draft.state[f.key]).length} of ${g.fns.length} allowed`}>
          {g.fns.map((fn) => {
            const grant = draft.state[fn.key]
            const changed = !sameGrant(grant, saved.state[fn.key]) || (fn.locations && !(sameIds(draft.clock.in, saved.clock.in) && sameIds(draft.clock.out, saved.clock.out)))
            const held = heldOnBy(fn.key, draft.state)
            const sub = !grant
              ? fn.help
              : fn.locations
                ? clockSummary(draft.clock, data.locations)
                : held
                  ? `Self comes with ${FN_BY_KEY[held].label}`
                  : describeGrant(fn, grant)
            return (
              <div key={fn.key} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] font-bold ${grant ? 'text-neutral-900' : 'text-neutral-400'}`}>
                      {fn.label}
                      {changed && <span className="ml-1.5 text-xs font-semibold text-brand-500">• changed</span>}
                    </p>
                    <p className={`text-[13px] ${grant ? 'text-neutral-500' : 'text-neutral-400'}`}>{sub}</p>
                  </div>
                  <Switch checked={!!grant} disabled={!!held} label={fn.label} onChange={(on) => setGrant(fn.key, on)} />
                </div>
                {grant && fn.scopes && fn.scopes.length > 1 && (
                  <SegmentedControl<Scope>
                    ariaLabel={`${fn.label} scope`}
                    shape="tabs"
                    className="mt-2.5"
                    value={grant.scope ?? fn.scopes[0]!}
                    onChange={(s) => setGrant(fn.key, true, s)}
                    options={fn.scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
                  />
                )}
                {grant && fn.locations && <LocationPicker value={draft.clock} onChange={setClock} locations={data.locations} />}
              </div>
            )
          })}
        </GroupCard>
      ))}

      <p className="px-1 text-xs text-neutral-500">
        Self = their own records · Team = the people they manage · All = everyone. Super Admins can always do everything.
      </p>

      <SaveBar count={total} saving={saving} onSave={save} onDiscard={() => setDrafts({})} />
    </div>
  )
}
