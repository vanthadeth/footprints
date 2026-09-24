import { useMemo, useState } from 'react'
import { Plus, Search, User as UserIcon, Users as UsersIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { displayName } from '@/lib/displayName'
import { useUsers } from '@/features/users/useUsers'
import { UserFormSheet } from '@/features/users/UserFormSheet'
import type { ManagedUser } from '@/features/users/usersService'

const STATUS_STYLES: Record<ManagedUser['status'], string> = {
  active: 'bg-status-working/10 text-status-working',
  suspended: 'bg-status-warn/10 text-status-warn',
  discharged: 'bg-status-danger/10 text-status-danger',
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
  const [roleFilter, setRoleFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editing, setEditing] = useState<ManagedUser | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter === 'active' && u.status !== 'active') return false
      if (statusFilter === 'inactive' && u.status === 'active') return false
      if (roleFilter && u.roleName !== roleFilter) return false
      if (!q) return true
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.nickname?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q)
      )
    })
  }, [users, query, statusFilter, roleFilter])

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

  const counts = useMemo(
    () => ({
      active: users.filter((u) => u.status === 'active').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
      discharged: users.filter((u) => u.status === 'discharged').length,
      fieldSales: users.filter((u) => u.status === 'active' && u.isFieldSales).length,
    }),
    [users]
  )
  const roleNames = useMemo(() => [...new Set(users.map((u) => u.roleName).filter((r): r is string => !!r))].sort(), [users])

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="space-y-3.5 px-4 pt-4 md:px-8">
        <div className="grid grid-cols-4 gap-2">
          <CountTile label="Active" value={counts.active} tone="text-status-working dark:text-emerald-300" />
          <CountTile label="Suspended" value={counts.suspended} tone="text-status-warn" />
          <CountTile label="Discharged" value={counts.discharged} tone="text-status-danger" />
          <CountTile label="Field Sales" value={counts.fieldSales} tone="text-neutral-900" />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search users"
              placeholder="Search name, email, position…"
              className="h-[46px] w-full rounded-xl border-[1.5px] border-neutral-200 bg-white pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex h-[46px] shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-bold text-white tap-target"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} /> New
          </button>
        </div>

        <SegmentedControl
          ariaLabel="Status filter"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map((f) => ({
            value: f.key,
            label: f.label,
            count: f.key === 'active' ? counts.active : f.key === 'inactive' ? counts.suspended + counts.discharged : users.length,
          }))}
        />

        {roleNames.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
            {['', ...roleNames].map((r) => {
              const active = roleFilter === r
              return (
                <button
                  key={r || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRoleFilter(r)}
                  className={`h-[34px] shrink-0 rounded-full border-[1.5px] px-3 text-xs font-semibold ${
                    active ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  {r || 'All roles'}
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No users found"
            body={
              statusFilter !== 'all'
                ? `No ${statusFilter} users match. Try the "All" filter, a different search, or create a new user.`
                : 'Try a different search, or create a new user.'
            }
          />
        ) : (
          <div className="space-y-4">
            {groups.map(([department, members]) => (
              <section key={department} className="space-y-2">
                <h2 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {department} · {members.length}
                </h2>
                <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
                  {members.map((u) => (
                    <UserRow key={u.id} user={u} onClick={() => openEdit(u)} />
                  ))}
                </div>
              </section>
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

function CountTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white px-1 py-2.5 shadow-card">
      <span className={`text-xl font-extrabold ${tone}`}>{value}</span>
      <span className="text-center text-[10.5px] font-semibold text-neutral-500">{label}</span>
    </div>
  )
}

function UserRow({ user, onClick }: { user: ManagedUser; onClick: () => void }) {
  const avatarUrl = useAvatarUrl(user.photoPath)
  const name = displayName(user.fullName, user.nickname)
  const initials = user.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const line2 = [user.position, user.managerName ? `reports to ${user.managerName}` : null].filter(Boolean).join(' · ')

  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-3.5 py-3 text-left tap-target ${user.status === 'active' ? '' : 'opacity-80'}`}>
      <div
        className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-extrabold ${
          user.status === 'active' ? 'bg-brand-50 text-brand-700' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials || <UserIcon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <p className="truncate text-[14.5px] font-bold text-neutral-900">{name}</p>
          {user.nickname && <p className="truncate text-xs text-neutral-500">{user.fullName}</p>}
        </div>
        {line2 && <p className="truncate text-xs text-neutral-600">{line2}</p>}
        <div className="mt-1 flex gap-1">
          {user.roleName && <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-bold text-neutral-600">{user.roleName}</span>}
          {user.isFieldSales && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-bold text-brand-700">Field Sales</span>}
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_STYLES[user.status]}`}>{user.status}</span>
    </button>
  )
}
