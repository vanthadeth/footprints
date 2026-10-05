import { useMemo, useState } from 'react'
import { ChevronRight, Plus, Search, User as UserIcon, Users as UsersIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Switch } from '@/components/Switch'
import { AdminFrame, AdminTabs } from '@/components/AdminKit'
import { useTab } from '@/hooks/useTab'
import { OrgContent } from './OrgPage'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { displayName } from '@/lib/displayName'
import { useUsers } from '@/features/users/useUsers'
import { UserFormSheet } from '@/features/users/UserFormSheet'
import type { ManagedUser } from '@/features/users/usersService'

const STATUS: Record<Exclude<ManagedUser['status'], 'active'>, { label: string; cls: string }> = {
  suspended: { label: 'Suspended', cls: 'bg-status-warn/10 text-status-warn' },
  discharged: { label: 'Left', cls: 'bg-status-danger/10 text-status-danger' },
}
const TABS = ['users', 'departments', 'roles'] as const

type StatusFilter = 'active' | 'inactive' | 'all'

const NO_DEPARTMENT = 'No Department'

/**
 * Users (Admin), laid out like the canvas (Polish › Admin › Users): Users,
 * Departments and Roles as tabs. Users are grouped by department with a
 * department filter and a "Show inactive users" switch; tapping one opens
 * the edit sheet (who they report to, role, field sales, status).
 */
export function UsersPage() {
  const { users, roles, departments, loading, error, refresh } = useUsers()
  const [tab, setTab] = useTab(TABS, 'users')
  const [query, setQuery] = useState('')
  // Suspended/discharged accounts pile up over time and aren't usually who
  // you're looking for -- hidden by default, one tap away via the filter.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [deptFilter, setDeptFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editing, setEditing] = useState<ManagedUser | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter === 'active' && u.status !== 'active') return false
      if (statusFilter === 'inactive' && u.status === 'active') return false
      if (deptFilter && (u.departmentName ?? NO_DEPARTMENT) !== deptFilter) return false
      if (!q) return true
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.nickname?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q)
      )
    })
  }, [users, query, statusFilter, deptFilter])

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
  const deptNames = useMemo(() => {
    const active = users.filter((u) => statusFilter === 'all' || u.status === 'active')
    const tally = new Map<string, number>()
    for (const u of active) tally.set(u.departmentName ?? NO_DEPARTMENT, (tally.get(u.departmentName ?? NO_DEPARTMENT) ?? 0) + 1)
    return [...tally.entries()].sort(([a], [b]) => (a === NO_DEPARTMENT ? 1 : b === NO_DEPARTMENT ? -1 : a.localeCompare(b)))
  }, [users, statusFilter])
  const shownTotal = deptNames.reduce((n, [, c]) => n + c, 0)

  return (
    <AdminFrame
      sub={`${counts.active} active · ${departments.length} departments · ${roles.length} roles`}
      tabs={
        <AdminTabs
          tabs={[
            ['users', 'Users'],
            ['departments', 'Departments'],
            ['roles', 'Roles'],
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {tab !== 'users' ? (
        <OrgContent kind={tab === 'roles' ? 'role' : 'department'} />
      ) : (
      <div className="space-y-3.5">
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

        {deptNames.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
            {[['', shownTotal] as [string, number], ...deptNames].map(([d, n]) => {
              const active = deptFilter === d
              return (
                <button
                  key={d || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDeptFilter(d)}
                  className={`h-[34px] shrink-0 rounded-full border px-3 text-xs font-bold ${
                    active ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900' : 'border-neutral-200 text-neutral-700'
                  }`}
                >
                  {d || 'All'} · {n}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-3 border-y border-neutral-100 py-2.5 dark:border-neutral-800">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-neutral-900">Show inactive users</span>
            <span className="block text-xs text-neutral-500">
              {statusFilter === 'all'
                ? `${counts.suspended + counts.discharged} inactive shown · they can’t sign in`
                : counts.suspended + counts.discharged === 1 ? '1 person who left or is suspended is hidden' : `${counts.suspended + counts.discharged} people who left or are suspended are hidden`}
            </span>
          </span>
          <Switch checked={statusFilter === 'all'} onChange={(on) => setStatusFilter(on ? 'all' : 'active')} label="Show inactive users" />
        </div>

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
                ? 'No active users match. Turn on Show inactive users, try a different search, or create a new user.'
                : 'Try a different search, or create a new user.'
            }
          />
        ) : (
          <div className="space-y-[18px]">
            {groups.map(([department, members]) => (
              <section key={department} aria-label={department}>
                <h2 className="mb-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
                  {department} · {members.length}
                </h2>
                <div className="border-b border-neutral-100 dark:border-neutral-800">
                  {members.map((u) => (
                    <UserRow key={u.id} user={u} onClick={() => openEdit(u)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 py-1 text-sm font-bold text-brand-500">
          <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} aria-hidden /> Invite a person
        </button>
      </div>
      )}

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
    </AdminFrame>
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

  const sub = [user.roleName, user.position, user.isFieldSales ? 'field sales' : null].filter(Boolean).join(' · ')
  const status = user.status === 'active' ? null : STATUS[user.status]

  return (
    <button onClick={onClick} className={`flex min-h-[58px] w-full items-center gap-3 border-t border-neutral-100 py-1.5 text-left dark:border-neutral-800 ${status ? 'opacity-70' : ''}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold ${status ? 'bg-neutral-200 text-neutral-500' : 'bg-brand-500 text-white'}`}>
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials || <UserIcon className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-neutral-900">
          {name}
          {user.nickname && <span className="font-normal text-neutral-500"> · {user.fullName}</span>}
        </p>
        <p className="truncate text-xs text-neutral-500">{[sub, user.managerName ? `reports to ${user.managerName}` : null].filter(Boolean).join(' · ')}</p>
      </div>
      {status && <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${status.cls}`}>{status.label}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
    </button>
  )
}
