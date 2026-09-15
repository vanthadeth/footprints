import { useMemo, useState } from 'react'
import { Plus, Search, User as UserIcon, Users as UsersIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { displayName } from '@/lib/displayName'
import { useUsers } from '@/features/users/useUsers'
import { UserFormSheet } from '@/features/users/UserFormSheet'
import type { ManagedUser } from '@/features/users/usersService'

const STATUS_STYLES: Record<ManagedUser['status'], string> = {
  active: 'bg-status-working/10 text-status-working',
  suspended: 'bg-status-warn/10 text-status-warn',
  discharged: 'bg-neutral-100 text-neutral-500',
}

type StatusFilter = 'active' | 'inactive' | 'all'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'all', label: 'All' },
]

const NO_DEPARTMENT = 'No Department'

/** Super-admin/HR screen: create and edit user accounts, assign who reports to whom, and mark who's a field salesperson (spec). */
export function UsersPage() {
  const { users, roles, departments, loading, error, refresh } = useUsers()
  const [query, setQuery] = useState('')
  // Suspended/discharged accounts pile up over time and aren't usually who
  // you're looking for -- hidden by default, one tap away via the filter.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editing, setEditing] = useState<ManagedUser | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter === 'active' && u.status !== 'active') return false
      if (statusFilter === 'inactive' && u.status === 'active') return false
      if (!q) return true
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.nickname?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q)
      )
    })
  }, [users, query, statusFilter])

  // Grouped by department, alphabetically -- users with no department
  // assigned sort last under a catch-all group rather than being scattered
  // or dropped.
  const groups = useMemo(() => {
    const byDepartment = new Map<string, ManagedUser[]>()
    for (const u of filtered) {
      const key = u.departmentName ?? NO_DEPARTMENT
      const list = byDepartment.get(key) ?? []
      list.push(u)
      byDepartment.set(key, list)
    }
    return [...byDepartment.entries()].sort(([a], [b]) => {
      if (a === NO_DEPARTMENT) return 1
      if (b === NO_DEPARTMENT) return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  function openCreate() {
    setFormMode('create')
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(user: ManagedUser) {
    setFormMode('edit')
    setEditing(user)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, position…"
              className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white tap-target"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-full bg-neutral-100 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold tap-target ${
                statusFilter === f.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="mt-4 space-y-2">
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={UsersIcon}
              title="No users found"
              body={
                statusFilter !== 'all'
                  ? `No ${statusFilter} users match. Try the "All" filter, a different search, or create a new user.`
                  : 'Try a different search, or create a new user.'
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map(([department, members]) => (
              <div key={department}>
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {department} <span className="text-neutral-300">· {members.length}</span>
                </p>
                <div className="space-y-2">
                  {members.map((u) => (
                    <UserRow key={u.id} user={u} onClick={() => openEdit(u)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UserFormSheet
        open={formOpen}
        mode={formMode}
        user={editing}
        users={users}
        roles={roles}
        departments={departments}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />
    </div>
  )
}

function UserRow({ user, onClick }: { user: ManagedUser; onClick: () => void }) {
  const avatarUrl = useAvatarUrl(user.photoPath)

  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl2 bg-white p-3.5 text-left shadow-card tap-target">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserIcon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">{displayName(user.fullName, user.nickname)}</p>
        <p className="truncate text-xs text-neutral-500">
          {user.roleName ?? '—'}
          {user.isFieldSales && ' · Field Sales'}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[user.status]}`}>
        {user.status}
      </span>
    </button>
  )
}
