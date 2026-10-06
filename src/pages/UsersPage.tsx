import { useMemo, useState } from 'react'
import { Mail, Phone, Plus, Search, User as UserIcon, Users as UsersIcon } from 'lucide-react'
import { Bone } from '@/components/Skeleton'
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
type Grouping = 'az' | 'dept'
const GROUPING_KEY = 'footprints.users.grouping'

/** The contact-list letter a name files under: A–Z, else #. */
const letterOf = (name: string) => {
  const c = name.trim().charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

/** A steady colour per person for their initials, like a phone's contacts. */
const TONES = ['bg-[#0a7ad6]', 'bg-[#1e9e5a]', 'bg-[#d9652b]', 'bg-[#8d4fd6]', 'bg-[#c23b6e]', 'bg-[#0f8f8f]', 'bg-[#b07d12]', 'bg-[#5b6b85]']
const toneOf = (id: string) => TONES[[...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length]

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
  const [grouping, setGroupingState] = useState<Grouping>(() => {
    try {
      return localStorage.getItem(GROUPING_KEY) === 'dept' ? 'dept' : 'az'
    } catch {
      return 'az'
    }
  })
  const setGrouping = (g: Grouping) => {
    setGroupingState(g)
    try {
      localStorage.setItem(GROUPING_KEY, g)
    } catch {
      /* remembered for this visit only */
    }
  }
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

  // A–Z like a phone's contacts (by the name shown), or by department with
  // "No Department" last; people sorted by name inside each group.
  const groups = useMemo(() => {
    const groups = new Map<string, ManagedUser[]>()
    const sorted = [...filtered].sort((x, y) => displayName(x.fullName, x.nickname).localeCompare(displayName(y.fullName, y.nickname)))
    for (const u of sorted) {
      const key = grouping === 'az' ? letterOf(displayName(u.fullName, u.nickname)) : (u.departmentName ?? NO_DEPARTMENT)
      const list = groups.get(key) ?? []
      list.push(u)
      groups.set(key, list)
    }
    const last = grouping === 'az' ? '#' : NO_DEPARTMENT
    return [...groups.entries()].sort(([x], [y]) => (x === last ? 1 : y === last ? -1 : x.localeCompare(y)))
  }, [filtered, grouping])

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

        <div role="radiogroup" aria-label="Order" className="inline-flex gap-0.5 rounded-xl bg-neutral-100 p-[3px]">
          {(
            [
              ['az', 'A–Z'],
              ['dept', 'By department'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={grouping === k}
              onClick={() => setGrouping(k)}
              className={`h-8 rounded-[9px] px-3.5 text-[13px] ${grouping === k ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3.5 py-3">
                <Bone className="h-12 w-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-4 w-1/2" />
                  <Bone className="h-3 w-1/3" />
                </div>
              </div>
            ))}
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
          <div className="relative">
            <div className={`space-y-5 ${grouping === 'az' && groups.length > 3 ? 'pr-5 md:pr-0' : ''}`}>
              {groups.map(([key, members]) => (
                <section key={key} id={`users-${key}`} aria-label={key} className="scroll-mt-20">
                  <h2 className={grouping === 'az' ? 'border-b border-neutral-100 pb-1 text-lg font-extrabold text-brand-500 dark:border-neutral-800' : 'border-b border-neutral-100 pb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500 dark:border-neutral-800'}>
                    {key}
                    {grouping === 'dept' && ` · ${members.length}`}
                  </h2>
                  {members.map((u) => (
                    <ContactRow key={u.id} user={u} showDepartment={grouping === 'az'} onClick={() => openEdit(u)} />
                  ))}
                </section>
              ))}
            </div>
            {grouping === 'az' && groups.length > 3 && (
              <nav aria-label="Jump to letter" className="fixed right-1 top-1/2 z-[5] flex -translate-y-1/2 flex-col items-center md:hidden">
                {groups.map(([key]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => document.getElementById(`users-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="flex h-[22px] w-6 items-center justify-center text-[11px] font-bold text-brand-500"
                  >
                    {key}
                  </button>
                ))}
              </nav>
            )}
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

/** One person, laid out like a phone contact: photo, name, job, number, and call / email buttons. */
function ContactRow({ user, showDepartment, onClick }: { user: ManagedUser; showDepartment: boolean; onClick: () => void }) {
  const avatarUrl = useAvatarUrl(user.photoPath)
  const name = displayName(user.fullName, user.nickname)
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const job = [user.position || user.roleName, showDepartment ? user.departmentName : null].filter(Boolean).join(' · ')
  const detail = [user.phonePrimary ?? user.email, user.managerName ? `reports to ${user.managerName}` : null].filter(Boolean).join(' · ')
  const status = user.status === 'active' ? null : STATUS[user.status]
  const action = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300'

  return (
    <div className={`flex items-center gap-3.5 border-b border-neutral-100 py-3 last:border-b-0 dark:border-neutral-800 ${status ? 'opacity-70' : ''}`}>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold text-white ${status ? 'bg-neutral-400' : toneOf(user.id)}`}>
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials || <UserIcon className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[17px] font-bold text-neutral-900">{name}</span>
            {status && <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${status.cls}`}>{status.label}</span>}
            {!status && user.isFieldSales && <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-status-working/10 px-2 text-[11px] font-bold text-status-working">Field</span>}
          </span>
          {user.nickname && <span className="block truncate text-[13px] text-neutral-500">{user.fullName}</span>}
          {job && <span className="block truncate text-[13.5px] text-neutral-700">{job}</span>}
          {detail && <span className="block truncate text-[12.5px] text-neutral-500">{detail}</span>}
        </span>
      </button>
      {user.phonePrimary && (
        <a href={`tel:${user.phonePrimary.replace(/[^\d+]/g, '')}`} aria-label={`Call ${name}`} className={action}>
          <Phone className="h-[18px] w-[18px]" aria-hidden />
        </a>
      )}
      {user.email && (
        <a href={`mailto:${user.email}`} aria-label={`Email ${name}`} className={`${action} hidden sm:flex ${user.phonePrimary ? '' : '!flex'}`}>
          <Mail className="h-[18px] w-[18px]" aria-hidden />
        </a>
      )}
    </div>
  )
}
