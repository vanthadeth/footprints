import { useCallback, useEffect, useState } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { usePermissions } from '@/features/permissions/PermissionsContext'
import { PersonTab } from '@/features/permissions/PersonTab'
import { RoleTab } from '@/features/permissions/RoleTab'
import { WhoTab } from '@/features/permissions/WhoTab'
import { errorText } from '@/features/permissions/permissionText'
import { permissionsService, type PermissionsData } from '@/features/permissions/permissionsService'

type Tab = 'role' | 'person' | 'who'

/**
 * Settings → Permissions (Super Admin and the System Admin role): who can
 * do what, by role or by person, and "who can…" for one function. Tabs stay
 * mounted so unsaved edits survive switching between them.
 */
export function PermissionsPage() {
  const { refresh } = usePermissions()
  const [tab, setTab] = useState<Tab>('role')
  const [data, setData] = useState<PermissionsData | null>(null)
  const [version, setVersion] = useState(0)
  const [roleId, setRoleId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await permissionsService.load()
      setData(next)
      setVersion((v) => v + 1)
      setRoleId((id) => id ?? next.roles[0]?.id ?? null)
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saved(text: string) {
    setMessage(text)
    await load()
    refresh()
  }

  return (
    <div className="mx-auto max-w-lg space-y-3.5 px-4 pb-40 pt-3 md:max-w-2xl md:px-8 md:pt-5">
      <SegmentedControl<Tab>
        ariaLabel="Permissions view"
        value={tab}
        onChange={(t) => {
          setTab(t)
          setMessage(null)
        }}
        options={[
          { value: 'role', label: 'By role' },
          { value: 'person', label: 'By person' },
          { value: 'who', label: 'Who can…' },
        ]}
      />

      {message && (
        <p role="status" className="rounded-xl bg-status-working/10 px-3 py-2 text-sm text-status-working dark:text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      {!data ? (
        !error && <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
      ) : (
        <div key={version}>
          <div hidden={tab !== 'role'}>
            <RoleTab data={data} roleId={roleId ?? ''} onRole={setRoleId} onSaved={saved} />
          </div>
          <div hidden={tab !== 'person'}>
            <PersonTab
              data={data}
              onSaved={saved}
              onOpenRole={(id) => {
                setRoleId(id)
                setTab('role')
              }}
            />
          </div>
          <div hidden={tab !== 'who'}>
            <WhoTab data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
