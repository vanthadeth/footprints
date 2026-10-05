import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CalendarRange, Loader2, Moon, Sun, Users } from 'lucide-react'
import { AdminFrame, AdminGroup, AdminRow, AdminTabs } from '@/components/AdminKit'
import { Stepper } from '@/components/Stepper'
import { useProfile } from '@/features/auth/useProfile'
import { summaryService } from '@/features/attendanceSummary/summaryService'
import { flexService } from '@/features/flex/flexService'
import { days as fmtDays, rate } from '@/features/flex/flex'
import { useTab } from '@/hooks/useTab'
import { todayDateString } from '@/lib/dateRange'
import { LeaveAllowancesPage } from './LeaveAllowancesPage'
import { HolidaysPage } from './HolidaysPage'

const TABS = ['cycle', 'allow', 'flex', 'holiday'] as const
type Tab = (typeof TABS)[number]
const SUB: Record<Tab, string> = { cycle: 'Monthly cycle for payroll', allow: 'Leave allowances', flex: 'Days earned for weekend work', holiday: 'Public holidays and company days off' }

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** The cycle containing `day` for a close day (0 = the calendar month), shifted `back` cycles into the past. */
function cycleOf(day: string, closeDay: number, back = 0): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number)
  if (closeDay === 0) return { start: iso(y, m - 1 - back, 1), end: iso(y, m - back, 0) }
  const endMonth = (d > closeDay ? m : m - 1) - back // 0-based month the cycle ends in
  return { start: iso(y, endMonth - 1, closeDay + 1), end: iso(y, endMonth, closeDay) }
}

/**
 * Attendance (Admin), laid out like the canvas (Polish › Admin ›
 * Attendance): Cycle (the payroll cycle and past cycles), Allowance (leave
 * allowances), Flexible (days earned for weekend work) and Holiday.
 */
export function AdminAttendancePage() {
  const [tab, setTab] = useTab(TABS, 'cycle')
  return (
    <AdminFrame
      sub={SUB[tab]}
      tabs={
        <AdminTabs
          tabs={[
            ['cycle', 'Cycle'],
            ['allow', 'Allowance'],
            ['flex', 'Flexible'],
            ['holiday', 'Holiday'],
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {tab === 'allow' ? <LeaveAllowancesPage embedded /> : tab === 'holiday' ? <HolidaysPage embedded /> : <CycleAndFlex tab={tab} />}
    </AdminFrame>
  )
}

interface Draft {
  closeDay: number
  sat: number
  sun: number
}

function CycleAndFlex({ tab }: { tab: 'cycle' | 'flex' }) {
  const { profile } = useProfile()
  const canEdit = profile?.is_super_admin === true || profile?.role_name === 'HR'
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState('')
  const [people, setPeople] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await flexService.settings()
      const d = { closeDay: s.closeDay, sat: s.satRate, sun: s.sunRate }
      setDraft(d)
      setSaved(JSON.stringify(d))
      setPeople(s.flexiblePeople)
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not load the settings.' })
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (!draft) return message ? <p className="text-sm text-status-danger">{message.text}</p> : <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />

  const dirty = JSON.stringify(draft) !== saved
  async function save() {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    try {
      const before = JSON.parse(saved) as Draft
      if (before.closeDay !== draft.closeDay) await summaryService.setCycleCloseDay(draft.closeDay)
      if (before.sat !== draft.sat || before.sun !== draft.sun) await flexService.setRates(draft.sat, draft.sun)
      await load()
      setMessage({ ok: true, text: 'Saved.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const today = todayDateString()
  const cur = cycleOf(today, draft.closeDay)
  const total = Math.round((Date.parse(cur.end) - Date.parse(cur.start)) / 86_400_000) + 1
  const dayN = Math.round((Date.parse(today) - Date.parse(cur.start)) / 86_400_000) + 1
  const past = [1, 2, 3].map((b) => cycleOf(today, draft.closeDay, b))

  return (
    <>
      {tab === 'cycle' ? (
        <>
          <section aria-label="This cycle" className="rounded-[18px] bg-brand-900 px-4 py-3.5 text-white">
            <p className="text-xs font-semibold text-white/60">This cycle</p>
            <p className="mt-0.5 text-[22px] font-bold">
              {label(cur.start)} – {label(cur.end)}
            </p>
            <div aria-hidden className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.12]">
              <span className="block h-full bg-[#45A5FF]" style={{ width: `${Math.min(100, (dayN / total) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-white/60">
              Day {dayN} of {total} · closes {label(cur.end)}
            </p>
          </section>
          <AdminGroup title="Cycle">
            <AdminRow
              icon={CalendarRange}
              label="Cycle runs"
              sub={draft.closeDay === 0 ? 'The calendar month' : `The ${ordinal(draft.closeDay + 1)} to the ${ordinal(draft.closeDay)}`}
              control={
                <Stepper label="Cycle day" value={draft.closeDay} max={28} format={(v) => (v === 0 ? 'Month end' : ordinal(v))} disabled={!canEdit} onChange={(v) => setDraft({ ...draft, closeDay: v })} />
              }
            />
            <AdminRow icon={Users} label="Monthly summary" sub="Hours, late, absent and leave per person" to="/fleet?tab=attendance" />
          </AdminGroup>
          <AdminGroup title="Past cycles">
            {past.map((c) => (
              <AdminRow key={c.start} icon={CalendarDays} label={`${label(c.start)} – ${label(c.end)}`} sub="Closed" pill={{ text: 'Closed', tone: 'ok' }} to="/fleet?tab=attendance" />
            ))}
          </AdminGroup>
        </>
      ) : (
        <>
          <AdminGroup title="Who earns flexible days">
            <AdminRow icon={Users} label={`${people} ${people === 1 ? 'person' : 'people'} on Flexible (travel)`} sub="People who often work weekends · set in Users › edit" to="/users" />
            <AdminRow icon={CalendarDays} label="Everyone’s flexible days" sub="Balances and days taken this cycle" to="/leave/flexible" />
          </AdminGroup>
          <AdminGroup title="How days are earned">
            <AdminRow
              icon={Sun}
              label="A Saturday worked"
              sub="For people on Flexible days off"
              control={<Stepper label="Saturday rate" value={draft.sat} step={0.5} max={2} format={(v) => `${rate(v)} day`} disabled={!canEdit} onChange={(v) => setDraft({ ...draft, sat: v })} />}
            />
            <AdminRow
              icon={Moon}
              label="A Sunday worked"
              sub={`4 Sat + 4 Sun a cycle = ${fmtDays(4 * draft.sat + 4 * draft.sun)} days`}
              control={<Stepper label="Sunday rate" value={draft.sun} step={0.5} max={2} format={(v) => `${rate(v)} day`} disabled={!canEdit} onChange={(v) => setDraft({ ...draft, sun: v })} />}
            />
          </AdminGroup>
          <p className="-mt-2 text-xs text-neutral-500">Flexible days can be taken in advance and settle on the cycle’s close day: unused days aren’t carried over, and extra days come from annual leave.</p>
        </>
      )}

      {message && <p className={`rounded-xl px-3 py-2 text-sm ${message.ok ? 'bg-status-working/10 text-status-working' : 'bg-status-danger/10 text-status-danger'}`}>{message.text}</p>}
      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 px-4 md:bottom-6">
          <div className="mx-auto max-w-lg md:max-w-2xl">
            <button type="button" onClick={save} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white shadow-lg disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}
    </>
  )
}
