import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Building2, CalendarDays, ChevronRight, Clock, Moon, Shield, ShieldCheck } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Switch } from '@/components/Switch'
import { AdminGroup, AdminRow } from '@/components/AdminKit'
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

/** The old Departments & roles screen now lives as tabs on Users. */
export function OrgPage() {
  return <Navigate to="/users?tab=departments" replace />
}

/**
 * Users › Departments / Roles (Super Admin only), as on the canvas: add,
 * rename and switch off departments and roles. Nothing is deleted --
 * switching one off hides it from pickers and leaves everyone in it as
 * they are. A new role can start with another role's permissions.
 */
export function OrgContent({ kind: tab }: { kind: OrgKind }) {
  const { profile, loading: profileLoading } = useProfile()
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

  const activeCount = list.filter((i) => i.active).length
  return (
    <div className="flex flex-col gap-[18px]">
      {tab === 'role' && savedRole && (
        <Link to="/settings/permissions" className="flex items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-semibold text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">
          Saved “{savedRole}”. Set its permissions
          <ChevronRight className="ml-auto h-4 w-4" />
        </Link>
      )}
      {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <AdminGroup title={`${tab === 'role' ? 'Roles' : 'Departments'} · ${activeCount}`} add={`Add a ${noun}`} onAdd={() => open(tab)}>
        {loading && <div className="my-3 h-24 animate-pulse rounded-xl bg-neutral-100" />}
        {list.map((i) => (
          <AdminRow
            key={i.id}
            icon={tab === 'role' ? Shield : Building2}
            label={i.name}
            sub={i.description || undefined}
            value={peopleText(i.people)}
            pill={i.active ? undefined : { text: 'Inactive', tone: 'plain' }}
            onClick={() => open(tab, i)}
          />
        ))}
        {!loading && list.length === 0 && <p className="border-t border-neutral-100 py-3 text-[13px] text-neutral-500 dark:border-neutral-800">No {noun}s yet.</p>}
      </AdminGroup>

      {tab === 'department' ? (
        <AdminGroup title="Rules a department sets">
          <AdminRow icon={Clock} label="Working schedule" sub="Which hours and days apply" to="/settings/working-hours" />
          <AdminRow icon={CalendarDays} label="Leave allowance" sub="Company default unless set per person" to="/admin/attendance?tab=allow" />
          <AdminRow icon={Moon} label="Flexible days off" sub="Who earns days for weekend work" to="/admin/attendance?tab=flex" />
        </AdminGroup>
      ) : (
        <p className="-mt-2 text-xs text-neutral-500">
          What each role can do is set on{' '}
          <Link to="/settings/permissions" className="font-bold text-brand-500">
            Permissions
          </Link>
          .
        </p>
      )}

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
