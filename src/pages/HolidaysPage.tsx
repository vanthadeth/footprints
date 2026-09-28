import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import { useProfile } from '@/features/auth/useProfile'
import { daysUntil, groupByMonth, holidayDayCount, nextHoliday, suggestedCambodiaHolidays, type Holiday } from '@/features/holidays/holidays'
import { holidaysService } from '@/features/holidays/holidaysService'
import { usersService } from '@/features/users/usersService'
import { todayDateString } from '@/lib/dateRange'

type Draft = Omit<Holiday, 'id'>

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dow = (day: string) => DOW[new Date(day + 'T00:00:00Z').getUTCDay()]
const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.')

/**
 * Public holidays (Hub › Administration). Holidays are never counted as
 * absent or late, and leave spanning one doesn't use allowance for that day
 * (app.work_day, 0089). HR and admins can edit.
 */
export function HolidaysPage() {
  const { profile } = useProfile()
  const canEdit = profile?.is_super_admin === true || profile?.role_name === 'HR'
  const today = todayDateString()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, depts] = await Promise.all([holidaysService.listYear(year), usersService.listDepartments()])
      setHolidays(list)
      setDepartments(depts)
      setError(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => groupByMonth(holidays), [holidays])
  const next = useMemo(() => nextHoliday(holidays, today), [holidays, today])
  const totalDays = holidays.reduce((s, h) => s + holidayDayCount(h), 0)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setEditing(null)
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const importSuggested = () =>
    run(async () => {
      const existing = new Set(holidays.map((h) => h.startDate))
      await holidaysService.createMany(suggestedCambodiaHolidays(year).filter((h) => !existing.has(h.startDate)))
    })

  const newDraft = (): Draft => ({ name: '', startDate: `${year}-01-01` > today ? `${year}-01-01` : today, endDate: `${year}-01-01` > today ? `${year}-01-01` : today, kind: 'public', halfDay: false, departmentIds: null })

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-3 md:max-w-2xl md:px-8">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="text-center">
          <p className="text-xl font-extrabold text-neutral-900">{year}</p>
          <p className="text-xs text-neutral-500">{holidays.length ? `${totalDays} days off · ${holidays.length} holidays` : 'Nothing set yet'}</p>
        </div>
        <button type="button" onClick={() => setYear(year + 1)} aria-label="Next year" className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
          <ChevronRight className="h-[18px] w-[18px]" />
        </button>
      </div>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : holidays.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-card">
          <EmptyState icon={CalendarDays} title={`No holidays set for ${year}`} body="Start from Cambodia’s fixed-date holidays, then add the lunar ones (Visak Bochea, Royal Ploughing, Pchum Ben, Water Festival) once their dates are announced." />
          {canEdit && (
            <div className="space-y-2 px-4 pb-4">
              <button type="button" onClick={importSuggested} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Add suggested holidays
              </button>
              <button type="button" onClick={() => setEditing({ id: null, draft: newDraft() })} className="h-11 w-full text-sm font-bold text-brand-600">
                Add a holiday myself
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {next && (
            <section className="flex items-center gap-3.5 rounded-2xl bg-brand-900 p-4 text-white" aria-label="Next holiday">
              <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/10">
                <span className="text-[10px] font-extrabold tracking-wider text-brand-100">{new Date(next.startDate + 'T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</span>
                <span className="text-xl font-extrabold leading-none">{Number(next.startDate.slice(8))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold tracking-wider text-brand-100">
                  {next.startDate <= today ? 'TODAY' : `NEXT HOLIDAY · IN ${daysUntil(today, next.startDate)} DAYS`}
                </span>
                <span className="mt-0.5 block truncate text-base font-bold">{next.name}</span>
                <span className="block text-xs text-brand-100">
                  {dow(next.startDate)}
                  {next.endDate !== next.startDate ? ` – ${dow(next.endDate)} · ${holidayDayCount(next)} days` : next.halfDay ? ' · afternoon off' : ''}
                </span>
              </span>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.month} aria-label={g.label} className="space-y-2">
              <h2 className="px-0.5 text-xs font-bold uppercase tracking-wide text-neutral-500">{g.label}</h2>
              <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
                {g.items.map((h, i) => {
                  const past = h.endDate < today
                  const days = holidayDayCount(h)
                  return (
                    <li key={h.id} className={i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
                      <button
                        type="button"
                        onClick={() => canEdit && setEditing({ id: h.id, draft: { ...h } })}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${canEdit ? 'tap-target' : 'cursor-default'} ${past ? 'opacity-55' : ''}`}
                      >
                        <span className={`flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${h === next ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
                          <span className={`text-[9.5px] font-extrabold ${h === next ? 'text-brand-100' : 'text-neutral-500'}`}>{dow(h.startDate).toUpperCase()}</span>
                          <span className={`whitespace-nowrap font-extrabold leading-tight ${h.endDate !== h.startDate ? 'text-[13px]' : 'text-base'}`}>
                            {Number(h.startDate.slice(8))}
                            {h.endDate !== h.startDate ? `–${Number(h.endDate.slice(8))}` : ''}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-neutral-900">{h.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                            {h.halfDay ? 'Afternoon off' : days > 1 ? `${days} days` : 'Full day'}
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold ${
                                h.kind === 'company' ? 'bg-status-visiting/10 text-status-visiting dark:text-violet-300' : 'bg-brand-50 text-brand-700'
                              }`}
                            >
                              {h.kind === 'company' ? 'Company' : 'Public'}
                            </span>
                            {h.departmentIds?.length ? <span>{h.departmentIds.map((id) => departments.find((d) => d.id === id)?.name ?? '…').join(', ')}</span> : null}
                          </span>
                        </span>
                        {canEdit && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          <p className="px-0.5 text-xs leading-relaxed text-neutral-500">
            Holidays are never counted as absent or late, and a leave request that spans one doesn’t use allowance for that day. Lunar-calendar holidays move every year — add them once the dates are announced.
          </p>
          {canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={importSuggested} disabled={busy} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-neutral-200 bg-white text-sm font-bold text-neutral-600 tap-target disabled:opacity-50">
                <Download className="h-4 w-4" /> Add suggested
              </button>
              <button type="button" onClick={() => setEditing({ id: null, draft: newDraft() })} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target">
                <Plus className="h-4 w-4" /> Add holiday
              </button>
            </div>
          )}
        </>
      )}

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit holiday' : 'Add holiday'}>
        {editing && (
          <HolidayForm
            draft={editing.draft}
            departments={departments}
            busy={busy}
            isNew={!editing.id}
            onChange={(draft) => setEditing({ ...editing, draft })}
            onSave={() => run(() => (editing.id ? holidaysService.update(editing.id, editing.draft) : holidaysService.create(editing.draft)))}
            onDelete={() => editing.id && run(() => holidaysService.remove(editing.id!))}
          />
        )}
      </BottomSheet>
    </div>
  )
}

function HolidayForm({
  draft,
  departments,
  busy,
  isNew,
  onChange,
  onSave,
  onDelete,
}: {
  draft: Draft
  departments: { id: string; name: string }[]
  busy: boolean
  isNew: boolean
  onChange: (d: Draft) => void
  onSave: () => void
  onDelete: () => void
}) {
  const everyone = !draft.departmentIds || draft.departmentIds.length === 0
  const valid = draft.name.trim() !== '' && !!draft.startDate && !!draft.endDate && draft.endDate >= draft.startDate
  const toggleDept = (id: string) => {
    const cur = draft.departmentIds ?? []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    onChange({ ...draft, departmentIds: next.length ? next : null })
  }
  return (
    <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
      <label className="block space-y-1.5">
        <span className="text-[13px] font-bold text-neutral-600">Name</span>
        <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="e.g. Khmer New Year" className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900 placeholder:text-neutral-400" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-neutral-600">From</span>
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => onChange({ ...draft, startDate: e.target.value, endDate: draft.endDate < e.target.value ? e.target.value : draft.endDate })}
            className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-neutral-600">To</span>
          <input type="date" value={draft.endDate} min={draft.startDate} onChange={(e) => onChange({ ...draft, endDate: e.target.value })} className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900" />
        </label>
      </div>
      <div className="space-y-1.5">
        <span className="text-[13px] font-bold text-neutral-600">Type</span>
        <SegmentedControl<Holiday['kind']>
          ariaLabel="Holiday type"
          shape="tabs"
          value={draft.kind}
          onChange={(kind) => onChange({ ...draft, kind })}
          options={[
            { value: 'public', label: 'Public holiday' },
            { value: 'company', label: 'Company day off' },
          ]}
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-neutral-900">Afternoon only</p>
          <p className="text-xs text-neutral-500">The morning is a normal working morning</p>
        </div>
        <Switch label="Afternoon only" checked={draft.halfDay} onChange={(halfDay) => onChange({ ...draft, halfDay })} />
      </div>
      <div className="space-y-2">
        <span className="text-[13px] font-bold text-neutral-600">Applies to</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={everyone}
            onClick={() => onChange({ ...draft, departmentIds: null })}
            className={`h-9 rounded-full border-[1.5px] px-3 text-[13px] font-bold ${everyone ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
          >
            Everyone
          </button>
          {departments.map((d) => {
            const on = !!draft.departmentIds?.includes(d.id)
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDept(d.id)}
                className={`h-9 rounded-full border-[1.5px] px-3 text-[13px] font-bold ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
              >
                {d.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex gap-2">
        {!isNew && (
          <button type="button" onClick={onDelete} disabled={busy} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-status-danger/40 text-sm font-bold text-status-danger tap-target">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
        <button type="button" onClick={onSave} disabled={busy || !valid} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save holiday
        </button>
      </div>
    </div>
  )
}
