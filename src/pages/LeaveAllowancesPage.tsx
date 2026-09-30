import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Stepper } from '@/components/Stepper'
import { Switch } from '@/components/Switch'
import { useProfile } from '@/features/auth/useProfile'
import { leaveErrorMessage, leaveService, type AllowanceRow, type LeavePolicy } from '@/features/leave/leaveService'
import { usersService, type ManagedUser } from '@/features/users/usersService'
import { displayName } from '@/lib/displayName'

type Filter = 'all' | 'custom' | 'default'

interface PersonAllowance {
  user: ManagedUser
  annual: AllowanceRow | undefined
  sick: AllowanceRow | undefined
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

/**
 * Leave allowances (Hub › Administration, HR/Super Admin): the company
 * default everyone gets, and a per-person override with a note. Allowance
 * is counted in working days -- weekends/days off and public holidays never
 * come out of it (0090).
 */
export function LeaveAllowancesPage() {
  const { profile } = useProfile()
  const canEdit = profile?.is_super_admin === true || profile?.role_name === 'HR'
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [policy, setPolicy] = useState<LeavePolicy | null>(null)
  const [savedPolicy, setSavedPolicy] = useState('')
  const [rows, setRows] = useState<AllowanceRow[]>([])
  const [people, setPeople] = useState<ManagedUser[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ userId: string; annual: number; sick: number; annualCustom: boolean; sickCustom: boolean; note: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, a, u] = await Promise.all([leaveService.policy(), leaveService.allowances(year), usersService.list()])
      setPolicy(p)
      setSavedPolicy(JSON.stringify(p))
      setRows(a)
      setPeople(u.filter((x) => x.status === 'active'))
      setError(null)
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const list: PersonAllowance[] = useMemo(
    () =>
      people
        .map((user) => ({
          user,
          annual: rows.find((r) => r.userId === user.id && r.leaveType === 'annual'),
          sick: rows.find((r) => r.userId === user.id && r.leaveType === 'sick'),
        }))
        .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName)),
    [people, rows]
  )
  const isCustom = (p: PersonAllowance) => !!(p.annual?.isCustom || p.sick?.isCustom)
  const customCount = list.filter(isCustom).length
  const shown = list.filter((p) => {
    if (filter === 'custom' && !isCustom(p)) return false
    if (filter === 'default' && isCustom(p)) return false
    const q = query.trim().toLowerCase()
    return !q || p.user.fullName.toLowerCase().includes(q) || (p.user.nickname ?? '').toLowerCase().includes(q) || (p.user.departmentName ?? '').toLowerCase().includes(q)
  })
  const policyDirty = !!policy && JSON.stringify(policy) !== savedPolicy

  async function savePolicy() {
    if (!policy) return
    setSaving(true)
    try {
      await leaveService.setPolicy(policy)
      await load()
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function openPerson(p: PersonAllowance) {
    if (!canEdit || !policy) return
    setEditing({
      userId: p.user.id,
      annual: p.annual?.isCustom ? p.annual.quotaDays - p.annual.carryDays : p.annual?.defaultDays ?? policy.annualDays,
      sick: p.sick?.isCustom ? p.sick.quotaDays : p.sick?.defaultDays ?? policy.sickDays,
      annualCustom: !!p.annual?.isCustom,
      sickCustom: !!p.sick?.isCustom,
      note: p.annual?.note ?? p.sick?.note ?? '',
    })
  }

  async function savePerson(reset = false) {
    if (!editing) return
    setSaving(true)
    try {
      const note = editing.note.trim() || null
      await leaveService.setAllowance(editing.userId, 'annual', year, reset || !editing.annualCustom ? null : editing.annual, note)
      await leaveService.setAllowance(editing.userId, 'sick', year, reset || !editing.sickCustom ? null : editing.sick, note)
      setEditing(null)
      await load()
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !policy) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 md:max-w-2xl md:px-8">
        <div className="h-44 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
        {error && <p className="text-sm text-status-danger">{error}</p>}
      </div>
    )
  }

  const sel = editing ? list.find((p) => p.user.id === editing.userId) : undefined
  const selUsed = sel?.annual?.usedDays ?? 0
  const selCarry = sel?.annual?.carryDays ?? 0

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-3 md:max-w-2xl md:px-8">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <p className="text-xl font-extrabold text-neutral-900">{year}</p>
        <button type="button" onClick={() => setYear(year + 1)} aria-label="Next year" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
          <ChevronRight className="h-[18px] w-[18px]" />
        </button>
      </div>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <Link to="/leave/flexible" className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-visiting/10 text-status-visiting dark:text-violet-300">
          <CalendarRange className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-neutral-900">Flexible days off</span>
          <span className="block text-[13px] text-neutral-500">Each cycle’s day off balance for people who travel</span>
        </span>
        <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
      </Link>

      <section className="space-y-3.5 rounded-2xl bg-white p-4 shadow-card" aria-label="Company default">
        <div>
          <h2 className="text-[17px] font-bold text-neutral-900">Company default</h2>
          <p className="text-[13px] text-neutral-500">Everyone without a custom allowance gets this each year, counted in working days.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DefaultTile label="Annual" tone="bg-brand-50 text-brand-700" value={policy.annualDays} disabled={!canEdit} onChange={(v) => setPolicy({ ...policy, annualDays: v })} />
          <DefaultTile label="Sick" tone="bg-status-working/10 text-status-working" value={policy.sickDays} disabled={!canEdit} onChange={(v) => setPolicy({ ...policy, sickDays: v })} />
        </div>
        <p className="text-xs text-neutral-500">Unpaid leave has no limit and isn’t tracked against an allowance.</p>
        <div className="flex items-center gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-neutral-900">Pro-rata for new joiners</p>
            <p className="text-xs text-neutral-500">Joined in June → 7 of 12 months of the default</p>
          </div>
          <Switch label="Pro-rata for new joiners" checked={policy.prorata} disabled={!canEdit} onChange={(v) => setPolicy({ ...policy, prorata: v })} />
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-neutral-900">Carry over unused annual</p>
            <p className="text-xs text-neutral-500">Up to this many days move into the next year</p>
          </div>
          <Stepper label="Carry-over" value={policy.carryOverMaxDays} step={0.5} max={30} format={(v) => `${fmt(v)} d`} disabled={!canEdit} onChange={(v) => setPolicy({ ...policy, carryOverMaxDays: v })} />
        </div>
        {canEdit && policyDirty && (
          <button type="button" onClick={savePolicy} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save company default
          </button>
        )}
      </section>

      <section className="space-y-2.5" aria-label="People">
        <div className="flex items-baseline justify-between px-0.5">
          <h2 className="text-[17px] font-bold text-neutral-900">People</h2>
          <span className="text-xs text-neutral-500">
            {customCount} custom · {list.length - customCount} on default
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <label htmlFor="allow-search" className="sr-only">
            Search people
          </label>
          <input
            id="allow-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or department"
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
        </div>
        <div role="group" aria-label="Filter" className="flex gap-1.5">
          {(
            [
              ['all', `All ${list.length}`],
              ['custom', `Custom ${customCount}`],
              ['default', `Default ${list.length - customCount}`],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`h-9 rounded-full border-[1.5px] px-3 text-[13px] font-bold ${filter === id ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
          {shown.map((p, i) => {
            const name = displayName(p.user.fullName, p.user.nickname)
            const custom = isCustom(p)
            const prorated = !custom && !!p.annual?.prorated
            const chip = custom ? 'Custom' : prorated ? 'Pro-rata' : 'Default'
            return (
              <li key={p.user.id} className={i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                <button type="button" onClick={() => openPerson(p)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${canEdit ? 'tap-target' : 'cursor-default'}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-extrabold text-brand-700">{initials(name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold text-neutral-900">{name}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold ${
                          custom ? 'bg-brand-50 text-brand-700' : prorated ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {chip}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      Annual {fmt(p.annual?.quotaDays ?? 0)} d · Sick {fmt(p.sick?.quotaDays ?? 0)} d
                      {custom && (p.annual?.note || p.sick?.note) ? ` · ${p.annual?.note ?? p.sick?.note}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-extrabold text-neutral-900">{fmt(p.annual?.remainingDays ?? 0)}</span>
                    <span className="block text-[11px] text-neutral-500">annual left</span>
                  </span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 && <li className="p-4 text-center text-sm text-neutral-500">No one matches.</li>}
        </ul>
        <p className="px-0.5 text-xs text-neutral-500">Changing the company default updates everyone on Default. Custom allowances stay as they are.</p>
      </section>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={sel ? displayName(sel.user.fullName, sel.user.nickname) : ''}>
        {editing && sel && (
          <div className="space-y-4 p-4">
            <p className="text-[13px] text-neutral-500">
              {sel.user.departmentName ?? 'No department'} · {year} allowance
            </p>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700">
              <PersonRow
                label="Annual"
                value={editing.annual}
                custom={editing.annualCustom}
                defaultDays={sel.annual?.defaultDays ?? policy.annualDays}
                onChange={(v) => setEditing({ ...editing, annual: v, annualCustom: true })}
                onUseDefault={() => setEditing({ ...editing, annual: sel.annual?.defaultDays ?? policy.annualDays, annualCustom: false })}
              />
              <PersonRow
                label="Sick"
                value={editing.sick}
                custom={editing.sickCustom}
                defaultDays={sel.sick?.defaultDays ?? policy.sickDays}
                onChange={(v) => setEditing({ ...editing, sick: v, sickCustom: true })}
                onUseDefault={() => setEditing({ ...editing, sick: sel.sick?.defaultDays ?? policy.sickDays, sickCustom: false })}
              />
            </div>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-bold text-neutral-600">Reason {editing.annualCustom || editing.sickCustom ? '(for the custom allowance)' : ''}</span>
              <input
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                placeholder="e.g. 5-year service, contract terms"
                className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900 placeholder:text-neutral-400"
              />
            </label>
            <p className="rounded-xl bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-700">
              Used <b>{fmt(selUsed)}</b> annual days so far{selCarry ? ` · ${fmt(selCarry)} carried over` : ''} ·{' '}
              <b>{fmt(Math.max(0, editing.annual + selCarry - selUsed))} days left</b> after this change
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => savePerson(true)} disabled={saving} className="h-12 rounded-xl border-[1.5px] border-neutral-200 text-sm font-bold text-neutral-600 tap-target">
                Reset to default
              </button>
              <button
                type="button"
                onClick={() => savePerson(false)}
                disabled={saving || ((editing.annualCustom || editing.sickCustom) && !editing.note.trim())}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

function DefaultTile({ label, tone, value, onChange, disabled }: { label: string; tone: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className={`space-y-2 rounded-xl p-3 ${tone}`}>
      <p className="text-xs font-bold">{label}</p>
      <p className="text-2xl font-extrabold leading-none text-neutral-900">
        {fmt(value)}
        <span className="text-sm font-bold text-neutral-500"> days</span>
      </p>
      <div className="rounded-lg bg-white dark:bg-neutral-900">
        <Stepper label={`${label} default`} value={value} step={0.5} max={60} format={(v) => fmt(v)} disabled={disabled} onChange={onChange} />
      </div>
    </div>
  )
}

function PersonRow({
  label,
  value,
  custom,
  defaultDays,
  onChange,
  onUseDefault,
}: {
  label: string
  value: number
  custom: boolean
  defaultDays: number
  onChange: (v: number) => void
  onUseDefault: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3 first:border-t-0 dark:border-neutral-800">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-neutral-900">{label}</p>
        {custom ? (
          <button type="button" onClick={onUseDefault} className="text-xs font-semibold text-brand-600">
            Custom · use default ({fmt(defaultDays)})
          </button>
        ) : (
          <p className="text-xs text-neutral-500">Company default</p>
        )}
      </div>
      <Stepper label={label} value={value} step={0.5} max={60} format={(v) => `${fmt(v)} d`} onChange={onChange} />
    </div>
  )
}
