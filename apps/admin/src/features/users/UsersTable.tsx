import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { DataTable, type Column } from '@footprints/shared/components/desktop/DataTable'
import type { ManagedUser, Option } from '@footprints/shared/features/users/usersService'
import { displayName } from '@footprints/shared/lib/displayName'
import { PrimaryButton, Select } from '@/components/form'
import { UserPanel } from './UserPanel'
import { matchesUser, type StatusFilter } from './filter'

const STATUS: Record<ManagedUser['status'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-status-working/10 text-status-working' },
  suspended: { label: 'Suspended', cls: 'bg-status-warn/10 text-status-warn' },
  discharged: { label: 'Left', cls: 'bg-status-danger/10 text-status-danger' },
}

const TONES = ['bg-[#0a7ad6]', 'bg-[#1e9e5a]', 'bg-[#d9652b]', 'bg-[#8d4fd6]', 'bg-[#c23b6e]', 'bg-[#0f8f8f]', 'bg-[#b07d12]', 'bg-[#5b6b85]']
const toneOf = (id: string) => TONES[[...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length]
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

const COLUMNS: Column<ManagedUser>[] = [
  {
    key: 'name',
    header: 'Name',
    sortValue: (u) => displayName(u.fullName, u.nickname).toLowerCase(),
    cell: (u) => (
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${toneOf(u.id)}`}>{initials(displayName(u.fullName, u.nickname))}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{displayName(u.fullName, u.nickname)}</p>
          {u.nickname?.trim() && <p className="truncate text-xs text-neutral-500">{u.fullName}</p>}
        </div>
      </div>
    ),
  },
  { key: 'email', header: 'Email', sortValue: (u) => u.email?.toLowerCase(), cell: (u) => <span className="text-neutral-600">{u.email ?? '—'}</span> },
  { key: 'position', header: 'Position', sortValue: (u) => u.position?.toLowerCase(), cell: (u) => u.position ?? '—' },
  { key: 'department', header: 'Department', sortValue: (u) => u.departmentName?.toLowerCase(), cell: (u) => u.departmentName ?? '—' },
  { key: 'role', header: 'Role', sortValue: (u) => u.roleName?.toLowerCase(), cell: (u) => u.roleName ?? '—' },
  { key: 'manager', header: 'Reports to', sortValue: (u) => u.managerName?.toLowerCase(), cell: (u) => u.managerName ?? '—' },
  {
    key: 'status',
    header: 'Status',
    sortValue: (u) => u.status,
    cell: (u) => (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[u.status].cls}`}>
        {STATUS[u.status].label}
        {u.isSuperAdmin && <span className="rounded bg-brand-500 px-1 text-[10px] text-white">SA</span>}
      </span>
    ),
  },
]

export function UsersTable({ users, roles, departments, loading, onChanged }: { users: ManagedUser[]; roles: Option[]; departments: Option[]; loading: boolean; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [departmentId, setDepartmentId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [panel, setPanel] = useState<{ mode: 'create' | 'edit'; user: ManagedUser | null } | null>(null)

  const rows = useMemo(() => users.filter((u) => matchesUser(u, query, status, departmentId, roleId)), [users, query, status, departmentId, roleId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, position, phone"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div className="w-40"><Select value={status} onChange={(v) => setStatus(v as StatusFilter)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></Select></div>
        <div className="w-44"><Select value={departmentId} onChange={setDepartmentId} placeholder="All departments">{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
        <div className="w-44"><Select value={roleId} onChange={setRoleId} placeholder="All roles">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
        <PrimaryButton onClick={() => setPanel({ mode: 'create', user: null })}><span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />New user</span></PrimaryButton>
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(u) => u.id}
        loading={loading}
        initialSort={{ key: 'name', dir: 'asc' }}
        selectedKey={panel?.user?.id ?? null}
        onRowClick={(u) => setPanel({ mode: 'edit', user: u })}
        empty="No users match these filters."
      />
      <UserPanel
        open={!!panel}
        mode={panel?.mode ?? 'create'}
        user={panel?.user ?? null}
        users={users}
        roles={roles}
        departments={departments}
        onClose={() => setPanel(null)}
        onSaved={onChanged}
      />
    </div>
  )
}
