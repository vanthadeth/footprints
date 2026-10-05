import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2, Settings2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import type { TeamMember } from '@/features/fleet/types'
import { displayName } from '@/lib/displayName'
import { todayDateString } from '@/lib/dateRange'
import { cycleFor, cycleLabel, cycleRule, datesBetween, ordinal, shortDate } from './attendanceCycle'
import { emptyTotals, formatDays, formatRate, teamKpis, totalsByPerson, totalsCsv, type AttendanceDay } from './attendanceSummary'
import { summaryService } from './summaryService'
import { useAttendanceDays } from './useAttendanceDays'

type Sort = 'name' | 'late' | 'absent'
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Team › Attendance › Monthly: totals per person for one attendance cycle.
 * The cycle closes on a set day (closing on the 20th covers the 21st of last
 * month to the 20th) -- admins change it from the ⚙ sheet.
 */
export function MonthlyAttendance({ team, canEditCycle }: { team: TeamMember[]; canEditCycle: boolean }) {
  const today = todayDateString()
  const [closeDay, setCloseDay] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<Sort>('name')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    summaryService
      .settings()
      .then((s) => setCloseDay(s.cycleCloseDay))
      .catch(() => setCloseDay(20))
  }, [])

  if (closeDay === null) return <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />

  return (
    <>
      <CycleView team={team} closeDay={closeDay} offset={offset} setOffset={setOffset} sort={sort} setSort={setSort} today={today} canEditCycle={canEditCycle} onSettings={() => setSettingsOpen(true)} />
      <CycleSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        closeDay={closeDay}
        today={today}
        onSaved={(d) => {
          setCloseDay(d)
          setOffset(0)
          setSettingsOpen(false)
        }}
      />
    </>
  )
}

function CycleView({
  team,
  closeDay,
  offset,
  setOffset,
  sort,
  setSort,
  today,
  canEditCycle,
  onSettings,
}: {
  team: TeamMember[]
  closeDay: number
  offset: number
  setOffset: (n: number) => void
  sort: Sort
  setSort: (s: Sort) => void
  today: string
  canEditCycle: boolean
  onSettings: () => void
}) {
  const cycle = cycleFor(closeDay, today, offset)
  const days = datesBetween(cycle.start, cycle.end)
  const ids = useMemo(() => team.map((m) => m.id), [team])
  const { rows, loading, error } = useAttendanceDays(cycle.start, cycle.end, ids)
  const totals = useMemo(() => totalsByPerson(rows), [rows])
  const k = useMemo(() => teamKpis(totals.values()), [totals])
  const inProgress = cycle.end >= today
  const daysLeft = Math.round((Date.parse(cycle.end) - Date.parse(today)) / 86_400_000)

  // What each date is for the team as a whole: a working day for anyone, else a holiday or a day off.
  const dayKind = useMemo(() => {
    const m = new Map<string, 'work' | 'holiday' | 'off'>()
    for (const d of days) {
      const onDay = rows.filter((r) => r.day === d)
      m.set(d, onDay.some((r) => r.isWorking) ? 'work' : onDay.some((r) => r.status === 'holiday') ? 'holiday' : onDay.length ? 'off' : 'work')
    }
    return m
  }, [rows, days])
  const workingDays = [...dayKind.values()].filter((v) => v === 'work').length
  const holidayCount = [...dayKind.values()].filter((v) => v === 'holiday').length
  const elapsedWorking = days.filter((d) => d <= today && dayKind.get(d) === 'work').length

  const list = team
    .map((m) => ({ member: m, name: displayName(m.fullName, m.nickname), t: totals.get(m.id) ?? emptyTotals(m.id) }))
    .sort((a, b) => (sort === 'late' ? b.t.late - a.t.late : sort === 'absent' ? b.t.absent - a.t.absent : 0) || a.name.localeCompare(b.name))

  function exportCsv() {
    const csv = totalsCsv(list.map((p) => ({ name: p.name, totals: p.t })))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${cycle.start}-to-${cycle.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3.5">
      <section className="space-y-3 rounded-2xl bg-white p-3.5 shadow-card" aria-label="Attendance cycle">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOffset(offset - 1)} aria-label="Previous cycle" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[17px] font-extrabold text-neutral-900">{cycleLabel(cycle)}</p>
            <p className="truncate text-xs text-neutral-500">{cycleRule(closeDay)}</p>
          </div>
          <button type="button" onClick={() => setOffset(Math.min(0, offset + 1))} disabled={offset >= 0} aria-label="Next cycle" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 tap-target disabled:opacity-40">
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${inProgress ? 'bg-status-warn/10 text-status-warn' : 'bg-status-working/10 text-status-working'}`}>
            {inProgress ? `In progress · closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : offset === -1 ? 'Last closed cycle' : 'Closed'}
          </span>
          {canEditCycle && (
            <button type="button" onClick={onSettings} aria-label="Attendance cycle settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 tap-target">
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="space-y-1">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d, i) => (
              <span key={`m-${d}`} className="h-3.5 overflow-visible whitespace-nowrap text-[9.5px] font-extrabold text-neutral-500">
                {i === 0 || d.endsWith('-01') ? MON[Number(d.slice(5, 7)) - 1] : ''}
              </span>
            ))}
          </div>
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const kind = dayKind.get(d)
              const bg = kind === 'holiday' ? 'bg-earth-500' : kind === 'off' || d > today ? 'bg-neutral-100' : 'bg-status-working'
              return <span key={d} title={shortDate(d)} className={`h-6 rounded-[4px] ${bg} ${d === today ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900' : ''}`} />
            })}
          </div>
          <div className="flex justify-between text-[11px] font-bold text-neutral-500">
            <span>{shortDate(cycle.start)}</span>
            <span>{shortDate(cycle.end)}</span>
          </div>
        </div>
      </section>

      {error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Working days" value={inProgress ? `${elapsedWorking}/${workingDays}` : String(workingDays)} />
        <Tile label="Attendance" value={formatRate(k.rate)} tone="text-status-working" />
        <Tile label="Late" value={String(k.late)} tone="text-status-warn" />
        <Tile label="Absent" value={String(k.absent)} tone="text-status-danger" />
        <Tile label="Leave days" value={formatDays(k.leaveDays)} tone="text-brand-600" />
        <Tile label="Holidays" value={String(holidayCount)} tone="text-earth-500" />
      </div>

      <section className="space-y-2" aria-label="By person">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-[17px] font-bold text-neutral-900">By person</h2>
          <div role="group" aria-label="Sort by" className="flex gap-1">
            {(['name', 'late', 'absent'] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                onClick={() => setSort(s)}
                className={`h-8 rounded-full border-[1.5px] px-2.5 text-xs font-bold capitalize ${sort === s ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <div className="grid grid-cols-[minmax(0,1fr)_36px_36px_36px_44px_40px] gap-1 border-b border-neutral-100 px-3.5 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            <span>Name</span>
            <span className="text-right">In</span>
            <span className="text-right">Late</span>
            <span className="text-right">Abs</span>
            <span className="text-right">Leave</span>
            <span className="text-right">Hrs</span>
          </div>
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-3">
              <div className="h-7 animate-pulse rounded bg-neutral-100" />
              <div className="h-7 animate-pulse rounded bg-neutral-100" />
            </div>
          ) : (
            list.map((p, i) => (
              <div key={p.member.id} className={`grid grid-cols-[minmax(0,1fr)_36px_36px_36px_44px_40px] items-center gap-1 px-3.5 py-2.5 tabular-nums ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-neutral-900">{p.name}</span>
                  <span className="block truncate text-[11px] text-neutral-500">{leaveDetail(p.t.leaveByType)}</span>
                </span>
                <span className="text-right text-[13.5px] font-bold text-neutral-900">{p.t.present}</span>
                <span className={`text-right text-[13.5px] font-bold ${p.t.late ? 'text-status-warn' : 'text-neutral-400'}`}>{p.t.late}</span>
                <span className={`text-right text-[13.5px] font-bold ${p.t.absent ? 'text-status-danger' : 'text-neutral-400'}`}>{p.t.absent}</span>
                <span className="text-right text-[13.5px] font-bold text-neutral-900">{formatDays(p.t.leaveDays)}</span>
                <span className="text-right text-[13.5px] font-bold text-neutral-900">{Math.round(p.t.workedMinutes / 60)}</span>
              </div>
            ))
          )}
        </div>
        <button type="button" onClick={exportCsv} disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-neutral-200 bg-white text-sm font-bold text-neutral-800 tap-target disabled:opacity-50">
          <Download className="h-4 w-4" /> Export {shortDate(cycle.start)} – {shortDate(cycle.end)} (CSV)
        </button>
        <p className="px-0.5 text-xs text-neutral-500">Working days skip weekends, days off and public holidays for each person’s team. The attendance rate leaves out approved leave.</p>
      </section>
    </div>
  )
}

function leaveDetail(byType: AttendanceDayTotals): string {
  const parts = (['annual', 'sick', 'unpaid', 'flex'] as const).filter((t) => byType[t]).map((t) => `${formatDays(byType[t]!)} ${t === 'flex' ? 'days off' : t}`)
  return parts.length ? parts.join(' · ') : 'No leave'
}
type AttendanceDayTotals = Partial<Record<NonNullable<AttendanceDay['leaveType']>, number>>

function Tile({ label, value, tone = 'text-neutral-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-card">
      <p className="text-[11.5px] font-bold text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-[22px] font-extrabold ${tone}`}>{value}</p>
    </div>
  )
}

function CycleSettingsSheet({ open, onClose, closeDay, today, onSaved }: { open: boolean; onClose: () => void; closeDay: number; today: string; onSaved: (d: number) => void }) {
  const [draft, setDraft] = useState(closeDay)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setDraft(closeDay)
      setError(null)
    }
  }, [open, closeDay])

  const thisCycle = cycleFor(draft, today)
  const nextCycle = cycleFor(draft, today, 1)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await summaryService.setCycleCloseDay(draft)
      onSaved(draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Attendance cycle">
      <div className="space-y-4 p-4">
        <p className="text-[13px] text-neutral-500">The monthly summary closes on this day each month.</p>
        <div role="radiogroup" aria-label="Cycle closes on day" className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={draft === n}
              aria-label={`Close on day ${n}`}
              onClick={() => setDraft(n)}
              className={`h-10 rounded-lg border-[1.5px] text-sm font-bold ${draft === n ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-800'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="radio"
          aria-checked={draft === 0}
          onClick={() => setDraft(0)}
          className={`h-11 w-full rounded-lg border-[1.5px] text-sm font-bold ${draft === 0 ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-800'}`}
        >
          Last day of the month (calendar month)
        </button>
        <div className="space-y-1 rounded-xl bg-brand-50 p-3.5 text-sm text-neutral-800">
          <p>{draft === 0 ? 'Each cycle is a calendar month, the 1st to the last day.' : `Closing on the ${ordinal(draft)} counts from the ${ordinal(draft + 1)} of last month to the ${ordinal(draft)} of this month.`}</p>
          <p className="text-[13px] text-neutral-600">
            This cycle: <b className="text-neutral-900">{cycleLabel(thisCycle)}</b>
            <br />
            Next cycle: <b className="text-neutral-900">{cycleLabel(nextCycle)}</b>
          </p>
        </div>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        <button type="button" onClick={save} disabled={saving || draft === closeDay} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>
    </BottomSheet>
  )
}
