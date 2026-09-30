import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, ShieldCheck } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import { useProfile } from '@/features/auth/useProfile'
import { orgService, type OrgItem } from '@/features/org/orgService'
import { deactivateNote, nameProblem, orgErrorText, peopleText, sortItems, type OrgKind } from '@/features/org/org'

interface Draft {
  kind: OrgKind
  id: string | null
  name: string
  description: string
  active: boolean
  copyFrom: string
  people: number
}

/**
 * Departments & roles (Hub › Administration, Super Admin only): add,
 * rename and switch off departments and roles. Nothing is deleted --
 * switching one off hides it from pickers and leaves everyone in it as
 * they are. A new role can start with another role's permissions.
 */
export function OrgPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [tab, setTab] = useState<OrgKind>('department')
  const [items, setItems] = useState<OrgItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedRole, setSavedRole] = useState<string | null>(null)
  const isSuperAdmin = profile?.is_super_admin === true

  const load = () => {
    setError(null)
    return orgService
      .overview()
      .then(setItems)
      .catch((e) => setError(orgErrorText(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (isSuperAdmin) load()
  }, [isSuperAdmin])

  if (profileLoading) return <div className="mx-auto mt-4 h-40 max-w-lg animate-pulse rounded-xl2 bg-neutral-100 md:max-w-2xl" />
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <ShieldCheck className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Only a Super Admin can manage departments and roles.</p>
      </div>
    )
  }

  const list = sortItems(items, tab)
  const roles = sortItems(items, 'role').filter((r) => r.active)
  const open = (kind: OrgKind, i?: OrgItem) => {
    setFormError(null)
    setDraft({ kind, id: i?.id ?? null, name: i?.name ?? '', description: i?.description ?? '', active: i?.active ?? true, copyFrom: '', people: i?.people ?? 0 })
  }

  async function save() {
    if (!draft) return
    const problem = nameProblem(draft.name, draft.kind, items, draft.id)
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (draft.kind === 'department') {
        await orgService.saveDepartment({ id: draft.id, name: draft.name.trim(), active: draft.active })
      } else {
        await orgService.saveRole({ id: draft.id, name: draft.name.trim(), description: draft.description, active: draft.active, copyFrom: draft.id ? null : draft.copyFrom || null })
        setSavedRole(draft.name.trim())
      }
      setDraft(null)
      await load()
    } catch (e) {
      setFormError(orgErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  const noun = tab === 'role' ? 'role' : 'department'
  const original = draft?.id ? items.find((i) => i.id === draft.id) : null
  const switchingOff = !!draft && !!original?.active && !draft.active

  return (
    <div className="mx-auto max-w-lg px-4 pb-6 pt-3 md:max-w-2xl md:px-8">
      <SegmentedControl
        ariaLabel="Departments or roles"
        value={tab}
        onChange={(v) => {
          setTab(v)
          setSavedRole(null)
        }}
        options={[
          { value: 'department', label: 'Departments', count: sortItems(items, 'department').filter((i) => i.active).length },
          { value: 'role', label: 'Roles', count: roles.length },
        ]}
      />

      {tab === 'role' && savedRole && (
        <Link to="/settings/permissions" className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-semibold text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">
          Saved “{savedRole}”. Set its permissions
          <ChevronRight className="ml-auto h-4 w-4" />
        </Link>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="px-1 text-xs text-neutral-500">{tab === 'role' ? 'What people can do is set per role on the Permissions page.' : 'Used for working hours, holidays and reports.'}</p>
        <button type="button" onClick={() => open(tab)} className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-brand-500 px-3.5 text-sm font-semibold text-white tap-target">
          <Plus className="h-4 w-4" /> Add {noun}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <div className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-xl2 bg-white shadow-card dark:divide-neutral-800">
        {loading && <div className="m-3.5 h-24 animate-pulse rounded-xl bg-neutral-100" />}
        {list.map((i) => (
          <button key={i.id} type="button" onClick={() => open(tab, i)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left tap-target">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className={`truncate text-[15px] font-medium ${i.active ? 'text-neutral-900' : 'text-neutral-500'}`}>{i.name}</span>
                {!i.active && <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-neutral-800">Inactive</span>}
              </span>
              {i.description && <span className="truncate text-xs text-neutral-500">{i.description}</span>}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">{peopleText(i.people)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
          </button>
        ))}
        {!loading && list.length === 0 && <p className="px-3.5 py-6 text-center text-sm text-neutral-500">No {noun}s yet.</p>}
      </div>

      <BottomSheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft ? `${draft.id ? 'Edit' : 'Add'} ${draft.kind === 'role' ? 'role' : 'department'}` : ''}
      >
        {draft && (
          <div className="flex flex-col gap-4 px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={draft.kind === 'role' ? 'e.g. Delivery Driver' : 'e.g. Marketing'}
                autoFocus
                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
              />
            </label>
            {draft.kind === 'role' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-neutral-700">
                  Description <span className="font-normal text-neutral-400">(optional)</span>
                </span>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="What this role is for"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
                />
              </label>
            )}
            {draft.kind === 'role' && !draft.id && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-neutral-700">Start with permissions from</span>
                <select
                  value={draft.copyFrom}
                  onChange={(e) => setDraft({ ...draft, copyFrom: e.target.value })}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900"
                >
                  <option value="">No permissions</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-neutral-500">You can fine-tune them on the Permissions page.</span>
              </label>
            )}
            {draft.id && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-700">Active</span>
                    <span className="text-xs text-neutral-500">{peopleText(draft.people)} in this {draft.kind}</span>
                  </span>
                  <Switch checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} label="Active" />
                </div>
                {switchingOff && <p className="rounded-lg bg-status-warn/10 px-3 py-2 text-xs text-status-warn">{deactivateNote(draft.kind, draft.people)}</p>}
              </div>
            )}
            {formError && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{formError}</p>}
            <button type="button" onClick={save} disabled={saving} className="h-12 rounded-2xl bg-brand-500 text-[15px] font-bold text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
