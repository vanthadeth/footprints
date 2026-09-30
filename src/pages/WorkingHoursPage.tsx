import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Stepper } from '@/components/Stepper'
import { useProfile } from '@/features/auth/useProfile'
import { ScheduleEditor } from '@/features/schedule/ScheduleEditor'
import { commonHours, dayHours, formatHours, fromMinutes, scheduleProblems, toMinutes, weekFrom, weekHours, workingDaysLabel, type DaySchedule } from '@/features/schedule/schedule'
import { scheduleService, type ClockRules, type WorkSchedule } from '@/features/schedule/scheduleService'
import { usersService } from '@/features/users/usersService'
import { summaryService } from '@/features/attendanceSummary/summaryService'
import { flexService } from '@/features/flex/flexService'
import { days as fmtDays, rate } from '@/features/flex/flex'
import { Link } from 'react-router-dom'

interface FlexDraft {
  closeDay: number
  sat: number
  sun: number
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

interface Draft {
  days: DaySchedule[]
  breakPaid: boolean
}

const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.')

/**
 * Working hours & days (Hub › Administration): the company schedule, the
 * clock-in rules, and team schedules that override the company one for a
 * department. Clock-in, late/absent alerts, auto clock-out, leave day counts
 * and the attendance summaries all follow these (app.work_day, 0089/0091).
 */
export function WorkingHoursPage() {
  const { profile } = useProfile()
  const canEdit = profile?.is_super_admin === true
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [company, setCompany] = useState<Draft | null>(null)
  const [savedCompany, setSavedCompany] = useState<string>('')
  const [rules, setRules] = useState<ClockRules | null>(null)
  const [savedRules, setSavedRules] = useState<string>('')
  const [flex, setFlex] = useState<FlexDraft | null>(null)
  const [savedFlex, setSavedFlex] = useState<string>('')
  const [flexPeople, setFlexPeople] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [team, setTeam] = useState<{ departmentId: string | null; draft: Draft; isNew: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, r, depts, fs] = await Promise.all([scheduleService.list(), scheduleService.rules(), usersService.listDepartments(), flexService.settings()])
      const fd = { closeDay: fs.closeDay, sat: fs.satRate, sun: fs.sunRate }
      setFlex(fd)
      setSavedFlex(JSON.stringify(fd))
      setFlexPeople(fs.flexiblePeople)
      setSchedules(list)
      setDepartments(depts)
      const c = list.find((s) => s.departmentId === null)
      const draft = c ? { days: c.days, breakPaid: c.breakPaid } : { days: weekFrom('08:00', '17:00', 60), breakPaid: false }
      setCompany(draft)
      setSavedCompany(JSON.stringify(draft))
      setRules(r)
      setSavedRules(JSON.stringify(r))
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const teams = useMemo(() => schedules.filter((s) => s.departmentId !== null), [schedules])
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? 'Team'
  const flexDirty = !!flex && JSON.stringify(flex) !== savedFlex
  const dirty = !!company && !!rules && (JSON.stringify(company) !== savedCompany || JSON.stringify(rules) !== savedRules || flexDirty)
  const problems = company ? scheduleProblems(company.days) : []

  async function save() {
    if (!company || !rules) return
    setSaving(true)
    setMessage(null)
    try {
      if (JSON.stringify(company) !== savedCompany) await scheduleService.save(null, company.breakPaid, company.days)
      if (JSON.stringify(rules) !== savedRules) await scheduleService.saveRules(rules)
      if (flex && flexDirty) {
        const before = JSON.parse(savedFlex) as FlexDraft
        if (before.closeDay !== flex.closeDay) await summaryService.setCycleCloseDay(flex.closeDay)
        if (before.sat !== flex.sat || before.sun !== flex.sun) await flexService.setRates(flex.sat, flex.sun)
      }
      await load()
      setMessage({ tone: 'ok', text: 'Saved. Clock-in, alerts and summaries use the new hours from now on.' })
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) })
    } finally {
      setSaving(false)
    }
  }

  async function saveTeam() {
    if (!team || !team.departmentId) return
    setSaving(true)
    setMessage(null)
    try {
      await scheduleService.save(team.departmentId, team.draft.breakPaid, team.draft.days)
      setTeam(null)
      await load()
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) })
    } finally {
      setSaving(false)
    }
  }

  async function removeTeam(departmentId: string) {
    setSaving(true)
    try {
      await scheduleService.removeTeam(departmentId)
      setTeam(null)
      await load()
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !company || !rules) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 md:max-w-2xl md:px-8">
        <div className="h-36 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
        {message && <p className="text-sm text-status-danger">{message.text}</p>}
      </div>
    )
  }

  const hours = commonHours(company.days)
  const firstStart = company.days.find((d) => d.isWorking)?.start ?? '08:00'
  const lastEnd = company.days.filter((d) => d.isWorking).reduce((m, d) => (d.end > m ? d.end : m), '00:00')
  const takenDepts = new Set(teams.map((t) => t.departmentId))
  const freeDepts = departments.filter((d) => !takenDepts.has(d.id))

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pb-28 pt-3 md:max-w-2xl md:px-8">
      {!canEdit && <p className="rounded-xl bg-status-warn/10 px-3 py-2 text-sm text-status-warn">Only admins can change working hours.</p>}

      <section className="rounded-2xl bg-brand-900 p-4 text-white" aria-label="Company schedule summary">
        <p className="text-[11px] font-extrabold tracking-wider text-brand-100">COMPANY SCHEDULE</p>
        <p className="mt-1.5 text-[22px] font-extrabold leading-tight">{workingDaysLabel(company.days)}</p>
        <p className="mt-1 text-[15px] font-semibold text-brand-100">
          {hours ? `${hours.start} – ${hours.end} · ${formatHours(dayHours(company.days.find((d) => d.isWorking)!, company.breakPaid))} a day` : 'Hours vary by day'}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
          <SummaryStat label="Per week" value={formatHours(weekHours(company.days, company.breakPaid))} />
          <SummaryStat label="Working days" value={`${company.days.filter((d) => d.isWorking).length} / 7`} />
          <SummaryStat label="Clock-in opens" value={fromMinutes(toMinutes(firstStart) - rules.allowEarlyClockinMinutes)} />
        </div>
      </section>

      <ScheduleEditor days={company.days} breakPaid={company.breakPaid} disabled={!canEdit} onChange={(days, breakPaid) => setCompany({ days, breakPaid })} />
      {problems.length > 0 && <p className="text-sm text-status-danger">{problems.join(' ')}</p>}

      <section className="space-y-2" aria-label="Clock-in rules">
        <h2 className="px-0.5 text-[17px] font-bold text-neutral-900">Clock-in rules</h2>
        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <RuleRow title="Early clock-in" sub={`Opens at ${fromMinutes(toMinutes(firstStart) - rules.allowEarlyClockinMinutes)}`}>
            <Stepper label="Early clock-in" value={rules.allowEarlyClockinMinutes} step={15} max={180} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, allowEarlyClockinMinutes: v })} />
          </RuleRow>
          <RuleRow title="Grace before late" sub={`Counted late from ${fromMinutes(toMinutes(firstStart) + rules.lateGraceMinutes + 1)}`}>
            <Stepper label="Grace" value={rules.lateGraceMinutes} max={120} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, lateGraceMinutes: v })} />
          </RuleRow>
          <RuleRow title="Manager alert if not clocked in" sub={`Alert at ${fromMinutes(toMinutes(firstStart) + rules.lateClockinThresholdMinutes)}`}>
            <Stepper label="Alert delay" value={rules.lateClockinThresholdMinutes} step={5} max={240} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, lateClockinThresholdMinutes: v })} />
          </RuleRow>
          <RuleRow title="Auto clock-out" sub={`Still clocked in at ${fromMinutes(toMinutes(lastEnd) + rules.autoClockoutGraceMinutes)} → clocked out, flagged`}>
            <Stepper label="Auto clock-out delay" value={rules.autoClockoutGraceMinutes} step={15} max={480} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, autoClockoutGraceMinutes: v })} />
          </RuleRow>
          <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
            <span className="flex-1 text-[15px] font-semibold text-neutral-900">Time zone</span>
            <span className="text-sm text-neutral-500">Phnom Penh (UTC+7)</span>
          </div>
        </div>
      </section>

      {flex && (
        <section className="space-y-2" aria-label="Attendance cycle and flexible days off">
          <div className="px-0.5">
            <h2 className="text-[17px] font-bold text-neutral-900">Attendance cycle &amp; flexible days off</h2>
            <p className="text-xs text-neutral-500">Attendance is counted to this day each month, not the month end.</p>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <RuleRow title="Cycle closes on" sub={flex.closeDay === 0 ? 'Counts the calendar month' : `Counts the ${ordinal(flex.closeDay + 1)} to the ${ordinal(flex.closeDay)}`}>
              <Stepper label="Cycle day" value={flex.closeDay} max={28} format={(v) => (v === 0 ? 'Month end' : ordinal(v))} disabled={!canEdit} onChange={(v) => setFlex({ ...flex, closeDay: v })} />
            </RuleRow>
            <RuleRow title="Saturday worked earns" sub="For people on Flexible (travel) days off">
              <Stepper label="Saturday rate" value={flex.sat} step={0.5} max={2} format={(v) => `${rate(v)} day`} disabled={!canEdit} onChange={(v) => setFlex({ ...flex, sat: v })} />
            </RuleRow>
            <RuleRow title="Sunday worked earns" sub={`4 Sat + 4 Sun a cycle = ${fmtDays(4 * flex.sat + 4 * flex.sun)} days`}>
              <Stepper label="Sunday rate" value={flex.sun} step={0.5} max={2} format={(v) => `${rate(v)} day`} disabled={!canEdit} onChange={(v) => setFlex({ ...flex, sun: v })} />
            </RuleRow>
            <Link to="/users" className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <span className="flex-1 text-[15px] font-semibold text-neutral-900">
                {flexPeople} {flexPeople === 1 ? 'person' : 'people'} on Flexible (travel)
              </span>
              <span className="text-xs text-neutral-500">Set in Users › Edit</span>
              <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
            </Link>
          </div>
          <p className="px-0.5 text-xs text-neutral-500">Flexible days off can be taken in advance and settle on the close day: unused days aren’t carried over, and extra days come from annual leave.</p>
        </section>
      )}

      <section className="space-y-2" aria-label="Team schedules">
        <div className="px-0.5">
          <h2 className="text-[17px] font-bold text-neutral-900">Team schedules</h2>
          <p className="text-xs text-neutral-500">Teams on different hours. Everyone else follows the company schedule.</p>
        </div>
        <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
          {teams.map((t, i) => (
            <li key={t.id} className={i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
              <button
                type="button"
                onClick={() => setTeam({ departmentId: t.departmentId, draft: { days: t.days, breakPaid: t.breakPaid }, isNew: false })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left tap-target"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Building2 className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-neutral-900">{deptName(t.departmentId)}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {workingDaysLabel(t.days)} · {commonHours(t.days) ? `${commonHours(t.days)!.start} – ${commonHours(t.days)!.end}` : 'hours vary'} · {formatHours(weekHours(t.days, t.breakPaid))}/week
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
              </button>
            </li>
          ))}
          <li className={teams.length ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
            <button
              type="button"
              disabled={!canEdit || freeDepts.length === 0}
              onClick={() => setTeam({ departmentId: freeDepts[0]?.id ?? null, draft: { days: company.days.map((d) => ({ ...d })), breakPaid: company.breakPaid }, isNew: true })}
              className="flex h-12 w-full items-center justify-center gap-1.5 text-sm font-bold text-brand-600 tap-target disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add team schedule
            </button>
          </li>
        </ul>
      </section>

      {message && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-status-working/10 text-status-working' : 'bg-status-danger/10 text-status-danger'}`}>
          {message.text}
        </p>
      )}

      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 px-4 md:bottom-6">
          <div className="mx-auto max-w-lg md:max-w-2xl">
            <button
              type="button"
              onClick={save}
              disabled={saving || problems.length > 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white shadow-lg tap-target disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}

      <BottomSheet open={team !== null} onClose={() => setTeam(null)} title={team?.isNew ? 'Add team schedule' : deptName(team?.departmentId ?? null)}>
        {team && (
          <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
            {team.isNew && (
              <label className="block space-y-1.5">
                <span className="text-[13px] font-bold text-neutral-600">Team</span>
                <select
                  value={team.departmentId ?? ''}
                  onChange={(e) => setTeam({ ...team, departmentId: e.target.value })}
                  className="h-12 w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 text-[15px] text-neutral-900"
                >
                  {freeDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ScheduleEditor days={team.draft.days} breakPaid={team.draft.breakPaid} onChange={(days, breakPaid) => setTeam({ ...team, draft: { days, breakPaid } })} />
            {scheduleProblems(team.draft.days).length > 0 && <p className="text-sm text-status-danger">{scheduleProblems(team.draft.days).join(' ')}</p>}
            <div className="flex gap-2">
              {!team.isNew && team.departmentId && (
                <button
                  type="button"
                  onClick={() => removeTeam(team.departmentId!)}
                  disabled={saving}
                  className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-status-danger/40 text-sm font-bold text-status-danger tap-target"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
              <button
                type="button"
                onClick={saveTeam}
                disabled={saving || !team.departmentId || scheduleProblems(team.draft.days).length > 0}
                className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save team schedule
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-brand-100">{label}</p>
      <p className="mt-0.5 text-base font-extrabold">{value}</p>
    </div>
  )
}

function RuleRow({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3 first:border-t-0 dark:border-neutral-800">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-neutral-900">{title}</p>
        <p className="text-xs text-neutral-500">{sub}</p>
      </div>
      {children}
    </div>
  )
}
