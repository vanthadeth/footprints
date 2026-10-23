import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { DataTable, type Column } from '@footprints/shared/components/desktop/DataTable'
import { SidePanel } from '@footprints/shared/components/desktop/SidePanel'
import { orgService, type OrgItem } from '@footprints/shared/features/org/orgService'
import { deactivateNote, nameProblem, orgErrorText, peopleText, sortItems, type OrgKind } from '@footprints/shared/features/org/org'
import { Field, Notice, PrimaryButton, SecondaryButton, Select, TextArea, TextInput, Toggle } from '@/components/form'

interface Draft {
  id: string | null
  name: string
  description: string
  active: boolean
  copyFrom: string
  people: number
}

/** Departments or Roles: a table plus a side panel to add, rename and switch off. Nothing is deleted; switching off hides it from pickers. */
export function OrgTable({ kind }: { kind: OrgKind }) {
  const [items, setItems] = useState<OrgItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setError(null)
    return orgService.overview().then(setItems).catch((e) => setError(orgErrorText(e))).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    setLoading(true)
    void load()
  }, [load, kind])

  const word = kind === 'role' ? 'role' : 'department'
  const rows = sortItems(items, kind)
  const activeRoles = sortItems(items, 'role').filter((r) => r.active)

  const columns: Column<OrgItem>[] = [
    { key: 'name', header: 'Name', sortValue: (i) => i.name.toLowerCase(), cell: (i) => <span className="font-semibold">{i.name}</span> },
    ...(kind === 'role' ? [{ key: 'description', header: 'Description', cell: (i: OrgItem) => <span className="text-neutral-600">{i.description || '—'}</span> }] : []),
    { key: 'people', header: 'People', align: 'right' as const, sortValue: (i) => i.people, cell: (i) => peopleText(i.people) },
    {
      key: 'active',
      header: 'Status',
      cell: (i) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${i.active ? 'bg-status-working/10 text-status-working' : 'bg-neutral-100 text-neutral-500'}`}>{i.active ? 'Active' : 'Off'}</span>,
    },
  ]

  const open = (i?: OrgItem) => {
    setFormError(null)
    setDraft({ id: i?.id ?? null, name: i?.name ?? '', description: i?.description ?? '', active: i?.active ?? true, copyFrom: '', people: i?.people ?? 0 })
  }

  async function save() {
    if (!draft || saving) return
    const problem = nameProblem(draft.name, kind, items, draft.id)
    if (problem) return setFormError(problem)
    setSaving(true)
    setFormError(null)
    try {
      if (kind === 'department') await orgService.saveDepartment({ id: draft.id, name: draft.name.trim(), active: draft.active })
      else await orgService.saveRole({ id: draft.id, name: draft.name.trim(), description: draft.description, active: draft.active, copyFrom: draft.id ? null : draft.copyFrom || null })
      setDraft(null)
      await load()
    } catch (e) {
      setFormError(orgErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{kind === 'role' ? 'Roles decide what people can do. Set a role’s permissions on the Permissions tab.' : 'Departments group people in lists and reports.'}</p>
        <PrimaryButton onClick={() => open()}><span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />New {word}</span></PrimaryButton>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <DataTable columns={columns} rows={rows} rowKey={(i) => i.id} loading={loading} onRowClick={open} selectedKey={draft?.id ?? null} empty={`No ${word}s yet.`} />
      <SidePanel open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? `Edit ${word}` : `New ${word}`}>
        {draft && (
          <div className="space-y-5 p-6">
            {formError && <Notice tone="error">{formError}</Notice>}
            <Field label="Name"><TextInput value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} /></Field>
            {kind === 'role' && <Field label="Description"><TextArea value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} placeholder="What this role is for" /></Field>}
            {kind === 'role' && !draft.id && (
              <Field label="Start from" hint="Copies that role’s permissions to begin with.">
                <Select value={draft.copyFrom} onChange={(v) => setDraft({ ...draft, copyFrom: v })} placeholder="No permissions">
                  {activeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
            )}
            <div className="space-y-1">
              <Toggle checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Active" />
              {draft.id && !draft.active && <p className="text-xs text-neutral-500">{deactivateNote(kind, draft.people)}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  )
}
