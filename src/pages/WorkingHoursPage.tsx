import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Clock3, Globe2, LogIn, LogOut, Loader2, Timer, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Stepper } from '@/components/Stepper'
import { useProfile } from '@/features/auth/useProfile'
import { ScheduleEditor } from '@/features/schedule/ScheduleEditor'
import { commonHours, dayHours, formatHours, fromMinutes, scheduleProblems, toMinutes, weekFrom, weekHours, workingDaysLabel, type DaySchedule } from '@/features/schedule/schedule'
import { scheduleService, type ClockRules, type WorkSchedule } from '@/features/schedule/scheduleService'
import { usersService } from '@/features/users/usersService'
import { AdminFrame, AdminGroup, AdminRow, AdminTabs } from '@/components/AdminKit'
import { useTab } from '@/hooks/useTab'

const TABS = ['hours', 'rules'] as const
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface Draft {
  days: DaySchedule[]
  breakPaid: boolean
}

const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Something went wrong.')

/**
 * Working hours (Admin), laid out like the canvas (Polish › Admin › Working
 * hours): "Hours & days" lists the company schedule and the team schedules
 * that override it for a department; "Rules" holds the clock-in and
 * clock-out rules. Clock-in, late/absent alerts, auto clock-out, leave day
 * counts and the attendance summaries all follow these (app.work_day,
 * 0089/0091). The attendance cycle and flexible days live on Attendance.
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
  const [tab, setTab] = useTab(TABS, 'hours')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [team, setTeam] = useState<{ departmentId: string | null; draft: Draft; isNew: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, r, depts] = await Promise.all([scheduleService.list(), scheduleService.rules(), usersService.listDepartments()])
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
  const dirty = !!company && !!rules && (JSON.stringify(company) !== savedCompany || JSON.stringify(rules) !== savedRules)
  const problems = company ? scheduleProblems(company.days) : []

  async function save() {
    if (!company || !rules) return
    setSaving(true)
    setMessage(null)
    try {
      if (JSON.stringify(company) !== savedCompany) await scheduleService.save(null, company.breakPaid, company.days)
      if (JSON.stringify(rules) !== savedRules) await scheduleService.saveRules(rules)
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
    <AdminFrame
      sub={`${teams.length + 1} ${teams.length ? 'schedules' : 'schedule'} · ${workingDaysLabel(company.days)}${hours ? ` ${hours.start}–${hours.end}` : ''}`}
      tabs={
        <AdminTabs
          tabs={[
            ['hours', 'Hours & days'],
            ['rules', 'Rules'],
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {!canEdit && <p className="rounded-xl bg-status-warn/10 px-3 py-2 text-sm text-status-warn">Only admins can change working hours.</p>}

      {tab === 'hours' ? (
        <>
          <ScheduleCard
            name="Company schedule"
            who={teams.length ? 'Everyone not on a team schedule' : 'Everyone'}
            days={company.days}
            breakPaid={company.breakPaid}
          />
          <ScheduleEditor days={company.days} breakPaid={company.breakPaid} disabled={!canEdit} onChange={(days, breakPaid) => setCompany({ days, breakPaid })} />
          {problems.length > 0 && <p className="text-sm text-status-danger">{problems.join(' ')}</p>}

          <AdminGroup
            title={`Team schedules · ${teams.length}`}
            note="Override the company hours"
            add="Add a schedule"
            addDisabled={!canEdit || freeDepts.length === 0}
            onAdd={() => setTeam({ departmentId: freeDepts[0]?.id ?? null, draft: { days: company.days.map((d) => ({ ...d })), breakPaid: company.breakPaid }, isNew: true })}
          >
            {teams.length === 0 && <p className="border-t border-neutral-100 py-3 text-[13px] text-neutral-500 dark:border-neutral-800">No team schedules yet. Everyone follows the company hours.</p>}
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeam({ departmentId: t.departmentId, draft: { days: t.days, breakPaid: t.breakPaid }, isNew: false })}
                className="block w-full border-t border-neutral-100 py-3 text-left dark:border-neutral-800"
              >
                <ScheduleCard name={deptName(t.departmentId)} who={`${formatHours(weekHours(t.days, t.breakPaid))} a week`} days={t.days} breakPaid={t.breakPaid} flat />
              </button>
            ))}
          </AdminGroup>
        </>
      ) : (
        <>
          <AdminGroup title="Clock in">
            <AdminRow
              icon={LogIn}
              label="Early clock-in"
              sub={`Opens at ${fromMinutes(toMinutes(firstStart) - rules.allowEarlyClockinMinutes)}`}
              control={<Stepper label="Early clock-in" value={rules.allowEarlyClockinMinutes} step={15} max={180} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, allowEarlyClockinMinutes: v })} />}
            />
            <AdminRow
              icon={Timer}
              label="Late after"
              sub={`Counted late from ${fromMinutes(toMinutes(firstStart) + rules.lateGraceMinutes + 1)}`}
              control={<Stepper label="Grace" value={rules.lateGraceMinutes} max={120} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, lateGraceMinutes: v })} />}
            />
            <AdminRow
              icon={CalendarClock}
              label="Alert if not clocked in"
              sub={`Alert at ${fromMinutes(toMinutes(firstStart) + rules.lateClockinThresholdMinutes)}`}
              control={<Stepper label="Alert delay" value={rules.lateClockinThresholdMinutes} step={5} max={240} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, lateClockinThresholdMinutes: v })} />}
            />
          </AdminGroup>
          <AdminGroup title="Clock out">
            <AdminRow
              icon={LogOut}
              label="Forgot to clock out"
              sub={`Clocked out automatically at ${fromMinutes(toMinutes(lastEnd) + rules.autoClockoutGraceMinutes)}, flagged`}
              control={<Stepper label="Auto clock-out delay" value={rules.autoClockoutGraceMinutes} step={15} max={480} format={(v) => `${v} min`} disabled={!canEdit} onChange={(v) => setRules({ ...rules, autoClockoutGraceMinutes: v })} />}
            />
          </AdminGroup>
          <AdminGroup title="General">
            <AdminRow icon={Globe2} label="Time zone" value="Phnom Penh (UTC+7)" />
            <AdminRow icon={Clock3} label="Attendance cycle & flexible days" sub="Cycle day, Saturday and Sunday rates" to="/admin/attendance?tab=cycle" />
          </AdminGroup>
        </>
      )}

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
    </AdminFrame>
  )
}

/** A schedule as on the canvas: its name, who it applies to, and the seven days with their hours. */
function ScheduleCard({ name, who, days, breakPaid, flat = false }: { name: string; who: string; days: DaySchedule[]; breakPaid: boolean; flat?: boolean }) {
  const hours = commonHours(days)
  return (
    <div className={flat ? '' : 'rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card'}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold text-neutral-900">{name}</p>
        <p className="text-xs text-neutral-500">{hours ? `${hours.start} – ${hours.end}` : 'Hours vary'}</p>
      </div>
      <p className="text-xs text-neutral-500">{who}</p>
      <div className="mt-2.5 grid grid-cols-7 gap-1 text-center">
        {days.map((d, i) => (
          <span key={d.isoDow} className={`rounded-lg py-1.5 ${d.isWorking ? 'bg-brand-50' : 'bg-neutral-100'}`}>
            <span className={`block text-[11px] font-bold ${d.isWorking ? 'text-brand-700' : 'text-neutral-500'}`}>{DOW[i]}</span>
            <span className={`block text-[11px] font-semibold ${d.isWorking ? 'text-neutral-900' : 'text-neutral-400'}`}>{d.isWorking ? formatHours(dayHours(d, breakPaid)).replace(' ', '') : '—'}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
