import { useSearchParams } from 'react-router-dom'
import { useUsers } from '@footprints/shared/features/users/useUsers'
import { OrgTable } from '@/features/org/OrgTable'
import { UsersTable } from '@/features/users/UsersTable'
import { Notice } from '@/components/form'

const TABS = [
  ['users', 'Users'],
  ['departments', 'Departments'],
  ['roles', 'Roles'],
] as const
type Tab = (typeof TABS)[number][0]

export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: Tab = TABS.some(([k]) => k === requested) ? (requested as Tab) : 'users'
  const { users, roles, departments, loading, error, refresh } = useUsers()
  const active = users.filter((u) => u.status === 'active').length

  return (
    <div className="mx-auto max-w-7xl p-8">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">User management</h1>
      <p className="mt-1 text-sm text-neutral-500">{loading ? 'Loading…' : `${active} active · ${departments.length} departments · ${roles.length} roles`}</p>
      <div role="tablist" className="mt-5 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'users' ? {} : { tab: key })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key ? 'border-brand-500 text-brand-500' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
        {tab === 'users' ? <UsersTable users={users} roles={roles} departments={departments} loading={loading} onChanged={refresh} /> : <OrgTable kind={tab === 'roles' ? 'role' : 'department'} />}
      </div>
    </div>
  )
}
