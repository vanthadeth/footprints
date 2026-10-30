import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { daysUntil, groupByMonth, holidayDayCount, holidayName, nextHoliday, suggestedCambodiaHolidays, type Holiday } from '@/features/holidays/holidays'
import { monthName } from '@/features/customers/detail/dates'
import { holidaysService } from '@/features/holidays/holidaysService'
import { usersService } from '@footprints/shared/features/users/usersService'
import { todayDateString } from '@/lib/dateRange'

type Draft = Omit<Holiday, 'id'>

const errorText = (e: unknown, fallback: string) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : fallback)

/**
 * Public holidays (Hub › Administration). Holidays are never counted as
 * absent or late, and leave spanning one doesn't use allowance for that day
 * (app.work_day, 0089). HR and admins can edit.
 */
/** `embedded` drops the page frame, for the Attendance page's tab. */
export function HolidaysPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, language } = useLanguage()
  const dow = (day: string) => t('holidays.dow').split(',')[new Date(day + 'T00:00:00Z').getUTCDay()]
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
      setError(errorText(e, t('holidays.wrong')))
    } finally {
      setLoading(false)
    }
  }, [year, t])

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
      setError(errorText(e, t('holidays.wrong')))
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
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-lg space-y-4 px-4 pb-8 pt-3 md:max-w-2xl md:px-8'}>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setYear(year - 1)} aria-label={t('holidays.prevYear')} className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="text-center">
          <p className="text-xl font-extrabold text-neutral-900">{year}</p>
          <p className="text-xs text-neutral-500">{holidays.length ? t('holidays.summary', { days: totalDays, n: holidays.length }) : t('holidays.nothingSet')}</p>
        </div>
        <button type="button" onClick={() => setYear(year + 1)} aria-label={t('holidays.nextYear')} className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
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
          <EmptyState icon={CalendarDays} title={t('holidays.emptyTitle', { year })} body={t('holidays.emptyBody')} />
          {canEdit && (
            <div className="space-y-2 px-4 pb-4">
              <button type="button" onClick={importSuggested} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t('holidays.addSuggested')}
              </button>
              <button type="button" onClick={() => setEditing({ id: null, draft: newDraft() })} className="h-11 w-full text-sm font-bold text-brand-600">
                {t('holidays.addMyself')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {next && (
            <section className="flex items-center gap-3.5 rounded-2xl bg-brand-900 p-4 text-white" aria-label={t('holidays.nextAria')}>
              <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/10">
                <span className="text-[10px] font-extrabold tracking-wider text-brand-100">{language === 'km' ? monthName(Number(next.startDate.slice(5, 7)) - 1, 'km') : new Date(next.startDate + 'T00:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</span>
                <span className="text-xl font-extrabold leading-none">{Number(next.startDate.slice(8))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold tracking-wider text-brand-100">
                  {next.startDate <= today ? t('holidays.today') : t('holidays.nextIn', { n: daysUntil(today, next.startDate) })}
                </span>
                <span className="mt-0.5 block truncate text-base font-bold">{holidayName(next.name, t)}</span>
                <span className="block text-xs text-brand-100">
                  {dow(next.startDate)}
                  {next.endDate !== next.startDate ? ` – ${dow(next.endDate)} · ${t('holidays.daysN', { n: holidayDayCount(next) })}` : next.halfDay ? t('holidays.afternoonOffSuffix') : ''}
                </span>
              </span>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.month} aria-label={monthName(g.month, language)} className="space-y-2">
              <h2 className="px-0.5 text-xs font-bold uppercase tracking-wide text-neutral-500">{monthName(g.month, language)}</h2>
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
                          <span className="block text-[15px] font-bold text-neutral-900">{holidayName(h.name, t)}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                            {h.halfDay ? t('holidays.afternoonOff') : days > 1 ? t('holidays.daysN', { n: days }) : t('holidays.fullDay')}
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold ${
                                h.kind === 'company' ? 'bg-status-visiting/10 text-status-visiting' : 'bg-brand-50 text-brand-700'
                              }`}
                            >
                              {h.kind === 'company' ? t('holidays.kindCompany') : t('holidays.kindPublic')}
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
            {t('holidays.note')}
          </p>
          {canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={importSuggested} disabled={busy} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-neutral-200 bg-white text-sm font-bold text-neutral-600 tap-target disabled:opacity-50">
                <Download className="h-4 w-4" /> {t('holidays.addSuggestedShort')}
              </button>
              <button type="button" onClick={() => setEditing({ id: null, draft: newDraft() })} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target">
                <Plus className="h-4 w-4" /> {t('holidays.addHoliday')}
              </button>
            </div>
          )}
        </>
      )}

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? t('holidays.editHoliday') : t('holidays.addHoliday')}>
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
  const { t } = useLanguage()
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
        <span className="text-[13px] font-bold text-neutral-600">{t('holidays.name')}</span>
        <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder={t('holidays.namePh')} className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900 placeholder:text-neutral-400" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-neutral-600">{t('holidays.from')}</span>
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => onChange({ ...draft, startDate: e.target.value, endDate: draft.endDate < e.target.value ? e.target.value : draft.endDate })}
            className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-neutral-600">{t('holidays.to')}</span>
          <input type="date" value={draft.endDate} min={draft.startDate} onChange={(e) => onChange({ ...draft, endDate: e.target.value })} className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900" />
        </label>
      </div>
      <div className="space-y-1.5">
        <span className="text-[13px] font-bold text-neutral-600">{t('holidays.type')}</span>
        <SegmentedControl<Holiday['kind']>
          ariaLabel={t('holidays.typeAria')}
          shape="tabs"
          value={draft.kind}
          onChange={(kind) => onChange({ ...draft, kind })}
          options={[
            { value: 'public', label: t('holidays.publicHoliday') },
            { value: 'company', label: t('holidays.companyDayOff') },
          ]}
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-neutral-900">{t('holidays.afternoonOnly')}</p>
          <p className="text-xs text-neutral-500">{t('holidays.afternoonOnlySub')}</p>
        </div>
        <Switch label={t('holidays.afternoonOnly')} checked={draft.halfDay} onChange={(halfDay) => onChange({ ...draft, halfDay })} />
      </div>
      <div className="space-y-2">
        <span className="text-[13px] font-bold text-neutral-600">{t('holidays.appliesTo')}</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={everyone}
            onClick={() => onChange({ ...draft, departmentIds: null })}
            className={`h-9 rounded-full border-[1.5px] px-3 text-[13px] font-bold ${everyone ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
          >
            {t('holidays.everyone')}
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
            <Trash2 className="h-4 w-4" /> {t('holidays.delete')}
          </button>
        )}
        <button type="button" onClick={onSave} disabled={busy || !valid} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('holidays.save')}
        </button>
      </div>
    </div>
  )
}
