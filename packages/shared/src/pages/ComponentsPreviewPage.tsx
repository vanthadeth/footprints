import { useState, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { AttendanceCalendar, AttendanceKey } from '../components/AttendanceCalendar'
import type { AttendanceRecord } from '../components/attendance'
import { Calendar } from '../components/Calendar'
import type { DayMarks } from '../components/calendar'
import { DayStrip } from '../components/DayStrip'
import { hm, type StripDay } from '../components/dayStrip'
import { useTheme } from '../lib/ThemeContext'

/** The design canvas the components are built from (Reusable Components page). */
const DESIGN_URL = 'https://claude.ai/artifact/6097a3bd-2ab7-4f7a-9e61-a8235eab334b'

const early: StripDay = {
  shiftStart: hm('08:00'),
  shiftEnd: hm('17:00'),
  clockIn: hm('07:45'),
  clockOut: hm('17:40'),
  visits: [
    { start: hm('08:10'), end: hm('08:14') },
    { start: hm('08:40'), end: hm('09:25'), icons: ['confirmed'] },
    { start: hm('09:50'), end: hm('11:05'), icons: ['ordered', 'appointment'] },
    { start: hm('13:00'), end: hm('13:35'), icons: ['collection'] },
    { start: hm('14:00'), end: hm('14:40'), flagged: true },
    { start: hm('15:00'), end: hm('15:07') },
    { start: hm('15:30'), end: hm('16:15'), icons: ['confirmed', 'collection'] },
  ],
}
const late: StripDay = {
  shiftStart: hm('08:00'),
  shiftEnd: hm('17:00'),
  clockIn: hm('09:20'),
  clockOut: hm('15:30'),
  visits: [
    { start: hm('09:50'), end: hm('09:54') },
    { start: hm('10:20'), end: hm('11:10'), icons: ['ordered'] },
    { start: hm('11:40'), end: hm('12:10'), icons: ['appointment'] },
    { start: hm('13:30'), end: hm('14:00'), flagged: true },
    { start: hm('14:20'), end: hm('14:23') },
  ],
}

const CAL_TODAY = '2026-10-23'
const CAL_MARKS: Record<string, DayMarks> = {
  '2026-10-06': { attendance: 'late', visit: true },
  '2026-10-08': { attendance: 'leave' },
  '2026-10-09': { attendance: 'leave' },
  '2026-10-13': { attendance: 'late', visit: true },
  '2026-10-14': { attendance: 'absent' },
  '2026-10-15': { holiday: true },
  '2026-10-16': { appointment: true, visit: true },
  '2026-10-20': { attendance: 'late', visit: true },
  '2026-10-22': { appointment: true, visit: true },
  '2026-10-23': { appointment: true, visit: true },
  '2026-10-24': { appointment: true },
  '2026-10-27': { appointment: true },
}

/** The calendar with its own selection, so tapping a day works on the preview page. */
function CalendarDemo({ view }: { view: 'month' | 'week' | 'agenda' }) {
  const [value, setValue] = useState('2026-10-27')
  return <Calendar today={CAL_TODAY} value={value} onSelect={setValue} defaultView={view} marks={CAL_MARKS} disabled={[{ from: '2026-10-31', to: '2026-10-31' }]} />
}

const ATT_RECORDS: Record<string, AttendanceRecord> = Object.fromEntries(
  [1, 2, 5, 7, 12, 16, 19, 22, 23].map((d) => [`2026-10-${String(d).padStart(2, '0')}`, { result: 'present' } as AttendanceRecord]),
)
Object.assign(ATT_RECORDS, {
  '2026-10-06': { result: 'late', minutes: 18 },
  '2026-10-08': { result: 'leave', code: 'AL' },
  '2026-10-09': { result: 'leave', code: 'AL' },
  '2026-10-13': { result: 'late', minutes: 35 },
  '2026-10-14': { result: 'absent' },
  '2026-10-20': { result: 'late', minutes: 12 },
  '2026-10-21': { result: 'leave', code: 'UL' },
  '2026-10-19': { result: 'leave', code: 'SL' },
})

function AttendanceDemo({ view }: { view: 'month' | 'week' }) {
  const [value, setValue] = useState<string | undefined>()
  return (
    <div>
      <AttendanceCalendar records={ATT_RECORDS} holidays={['2026-10-15']} today={CAL_TODAY} value={value} onSelect={setValue} defaultView={view} />
      <AttendanceKey />
    </div>
  )
}

interface Entry {
  id: string
  name: string
  /** Artboard in the design canvas. */
  board: string
  source: string
  variants: { label: string; node: ReactNode }[]
}

const card = (node: ReactNode) => <div className="max-w-[390px] bg-white p-4 dark:bg-[#232323]">{node}</div>

/** One entry per finished component, in the order they were built. */
const ENTRIES: Entry[] = [
  {
    id: 'day-strip',
    name: 'Progress bar (day strip)',
    board: 'ProgressBar.dc.html',
    source: 'src/components/DayStrip.tsx',
    variants: [
      { label: 'Early in, late out, with shift lines', node: card(<DayStrip day={early} shiftLines />) },
      { label: 'Late in, early out, one flagged visit', node: card(<DayStrip day={late} shiftLines />) },
      { label: 'No shift lines', node: card(<DayStrip day={early} />) },
      { label: 'Thin: for lists and team rows', node: card(<DayStrip day={late} thin />) },
    ],
  },
  {
    id: 'day-strip-indicators',
    name: 'Day bar (strip with indicators)',
    board: 'DayBar.dc.html',
    source: 'packages/shared/src/components/DayStrip.tsx (indicators)',
    variants: [
      { label: 'Early in, late out: far-away flag, order / collection / appointment icons', node: card(<DayStrip day={early} shiftLines indicators />) },
      { label: 'Late in, early out', node: card(<DayStrip day={late} shiftLines indicators />) },
    ],
  },
  {
    id: 'calendar',
    name: 'Calendar (month, week, agenda)',
    board: 'Calendar.dc.html',
    source: 'packages/shared/src/components/Calendar.tsx',
    variants: [
      { label: 'Month: tap a day. Holiday stripes, late / leave / absent backgrounds, appointment and visit dots, 31 Oct disabled', node: <CalendarDemo view="month" /> },
      { label: 'Week', node: <CalendarDemo view="week" /> },
      { label: 'Agenda', node: <CalendarDemo view="agenda" /> },
    ],
  },
  {
    id: 'attendance-calendar',
    name: 'Attendance calendar (one person)',
    board: 'AttendanceCalendar.dc.html',
    source: 'packages/shared/src/components/AttendanceCalendar.tsx',
    variants: [
      { label: 'Month: green check present, grey AL / UL / SL, red A absent, amber total minutes late or early', node: <AttendanceDemo view="month" /> },
      { label: 'Week', node: <AttendanceDemo view="week" /> },
    ],
  },
]

/** Every built component on one page, light or dark with the toggle, each linked back to its design artboard. */
function ThemeButton() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className="fixed right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-500 shadow-card backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

/** `themeToggle`: show a floating light/dark button, for the public route that has no app shell around it. */
export function ComponentsPreviewPage({ themeToggle = false }: { themeToggle?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {themeToggle && <ThemeButton />}
      <h1 className="text-2xl font-semibold">Components</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Built from the <a className="underline" href={DESIGN_URL} target="_blank" rel="noreferrer">design canvas</a>, one at a time.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2 text-sm">
        {ENTRIES.map((e) => (
          <li key={e.id}><a className="underline" href={`#${e.id}`}>{e.name}</a></li>
        ))}
      </ul>
      {ENTRIES.map((e) => (
        <section key={e.id} id={e.id} className="mt-10">
          <h2 className="text-lg font-semibold">{e.name}</h2>
          <p className="text-xs text-neutral-500">
            <code>{e.source}</code> · design artboard <a className="underline" href={DESIGN_URL} target="_blank" rel="noreferrer">{e.board}</a>
          </p>
          <div className="mt-4 space-y-5">
            {e.variants.map((v) => (
              <div key={v.label}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">{v.label}</p>
                {v.node}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
