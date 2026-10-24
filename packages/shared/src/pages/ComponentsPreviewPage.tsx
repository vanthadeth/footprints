import { useState, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { AppBar } from '../components/AppBar'
import { dateLine, type NotificationItem } from '../components/appBar'
import { AttendanceCalendar, AttendanceKey } from '../components/AttendanceCalendar'
import { BottomNav } from '../components/BottomNav'
import { SHORTCUT_OPTIONS, tabsForRole } from '../components/bottomNav'
import type { AttendanceRecord } from '../components/attendance'
import { Calendar } from '../components/Calendar'
import { TeamAttendanceCalendar, TeamCalendar } from '../components/TeamCalendar'
import { NextUnlocksSheet, TrophyCard, TrophyDetailsSheet, TrophyHistorySheet, TrophyTiles } from '../components/Trophies'
import type { Lang, TrophyId } from '../components/trophies'
import { PREVIEW_HISTORY, PREVIEW_LAST_MONTH, PREVIEW_TROPHIES, previewRoster } from './componentsPreviewData'
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

const NOTES: NotificationItem[] = [
  { id: '1', kind: 'alert', title: 'Invoice overdue · Lucky Mart', detail: '$480 unpaid for 14 days', time: '9:12', unread: true },
  { id: '2', kind: 'announcement', title: 'Manager · Mr. Vireak', detail: 'New promo starts Monday on 6 SKUs', time: '8:40', unread: true },
  { id: '3', kind: 'approved', title: 'Leave approved', detail: 'Annual leave 2 Nov, full day', time: 'Tue' },
  { id: '4', kind: 'reminder', title: 'Reminder', detail: 'Appointment at Sok Heng Minimart, 10:00', time: 'Tue' },
]
const DATE_LINE = dateLine('2026-10-23')
const PROFILE = { name: 'Dara Sok', role: 'Salesperson' }

/** A phone-width frame on the page background; panels open inside it. */
const frame = (node: ReactNode, height?: number) => (
  <div className="relative w-[390px] max-w-full overflow-hidden bg-[var(--ab-page)]" style={height ? { height } : undefined}>{node}</div>
)
const stub = <div className="mx-4 mt-2.5 h-10 rounded-2xl bg-[var(--ab-card)]" />

function ProfileDemo() {
  const [prefs, setPrefs] = useState({ khmer: false, dark: false })
  return frame(<><AppBar title="Calendar" dateLine={DATE_LINE} initials="DS" notifications={NOTES} profile={PROFILE} preferences={prefs} onPreferenceChange={(k, v) => setPrefs({ ...prefs, [k]: v })} overlay="absolute" defaultOpen="profile" />{stub}</>, 430)
}

function NavDemo({ role }: { role: 'salesperson' | 'manager' }) {
  const [active, setActive] = useState('calendar')
  const [shortcut, setShortcut] = useState('briefing')
  const [clockedIn, setClockedIn] = useState(false)
  return (
    <div className="w-[390px] max-w-full">
      <BottomNav
        tabs={tabsForRole(role, { messages: 3, approvals: 120, shortcut })}
        active={active}
        onSelect={(k) => { setActive(k); if (k === 'checkin') setClockedIn(!clockedIn) }}
        clockedIn={clockedIn}
        shortcut={role === 'salesperson' ? { options: SHORTCUT_OPTIONS, onChange: setShortcut } : undefined}
      />
    </div>
  )
}

const noop = () => {}

function TilesDemo() {
  const [lang, setLang] = useState<Lang>('en')
  const [open, setOpen] = useState<TrophyId | null>(null)
  return (
    <div className="relative max-w-[480px] overflow-hidden">
      <div className="mb-3 inline-flex gap-0.5 rounded-full bg-neutral-200 p-[3px] dark:bg-neutral-800" role="radiogroup" aria-label="Language">
        {(['en', 'km'] as const).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={`h-[30px] rounded-full px-3.5 text-xs font-semibold ${lang === l ? 'bg-white font-bold text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>
            {l === 'en' ? 'EN' : 'ខ្មែរ'}
          </button>
        ))}
      </div>
      <TrophyTiles progress={PREVIEW_TROPHIES} lang={lang} onSelect={setOpen} />
      <p className="mt-2 text-xs text-neutral-500">Tap a trophy for its details.</p>
      {open && <TrophyDetailsSheet id={open} progress={PREVIEW_TROPHIES[open]} monthLabel="October 2026" onClose={() => setOpen(null)} overlay="absolute" />}
      {open && <div className="h-[560px]" />}
    </div>
  )
}

const TEAM = previewRoster()
const teamView = (node: ReactNode) => <div className="w-full">{node}</div>

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
  {
    id: 'team-attendance-calendar',
    name: 'Team attendance calendar (managers)',
    board: 'TeamAttendance.dc.html',
    source: 'packages/shared/src/components/TeamCalendar.tsx (TeamAttendanceCalendar)',
    variants: [
      { label: 'Month: one row per person, marks in every cell, totals at the end of the row. Tap a date for the day list', node: teamView(<TeamAttendanceCalendar data={TEAM} value="2026-10-16" subtitle="Sales team Phnom Penh" />) },
      { label: 'Week', node: teamView(<TeamAttendanceCalendar data={TEAM} defaultView="week" value="2026-10-16" subtitle="Sales team Phnom Penh" />) },
    ],
  },
  {
    id: 'team-calendar',
    name: 'Team calendar (managers)',
    board: 'TeamCalendar.dc.html',
    source: 'packages/shared/src/components/TeamCalendar.tsx (TeamCalendar)',
    variants: [
      { label: 'Month: colour for late, leave, absent and holiday; a dot for a day with visits', node: teamView(<TeamCalendar data={TEAM} value="2026-10-16" subtitle="Sales team Phnom Penh" />) },
      { label: 'Week: visits and order amount in each cell', node: teamView(<TeamCalendar data={TEAM} defaultView="week" value="2026-10-16" subtitle="Sales team Phnom Penh" />) },
    ],
  },
  {
    id: 'app-bar',
    name: 'App bar',
    board: 'AppBar.dc.html',
    source: 'packages/shared/src/components/AppBar.tsx',
    variants: [
      { label: 'Tab screen: date line, large title, notifications and profile', node: frame(<><AppBar title="Calendar" dateLine={DATE_LINE} initials="DS" notifications={NOTES} overlay="absolute" />{stub}</>) },
      { label: 'Tab screen scrolled: compact title with a bottom border', node: frame(<><AppBar title="Calendar" dateLine={DATE_LINE} compact initials="DS" notifications={NOTES} overlay="absolute" />{stub}</>) },
      { label: 'Today: greeting as the title', node: frame(<AppBar title="Good morning, Dara" dateLine={DATE_LINE} initials="DS" notifications={NOTES} overlay="absolute" />) },
      { label: 'Sub screen: back, title with one line under it, one action', node: frame(<AppBar variant="sub" title="Sok Heng Minimart" subtitle="Toul Kork" action={{ kind: 'more', label: 'More', onClick: () => {} }} />) },
      { label: 'Sub screen with search action', node: frame(<AppBar variant="sub" title="Customers" subtitle="128 customers" action={{ kind: 'search', label: 'Search', onClick: () => {} }} />) },
      { label: 'Tap the bell: notifications open in a bottom sheet', node: frame(<AppBar title="Calendar" dateLine={DATE_LINE} initials="DS" notifications={NOTES} overlay="absolute" defaultOpen="notifications" />, 600) },
      { label: 'Tap the profile circle: dropdown menu (the switches work)', node: <ProfileDemo /> },
      { label: 'Offline: banner above the bar', node: frame(<><AppBar title="Calendar" dateLine={DATE_LINE} initials="DS" offline overlay="absolute" />{stub}</>) },
    ],
  },
  {
    id: 'bottom-nav',
    name: 'Bottom navigation bar',
    board: 'BottomNav.dc.html',
    source: 'packages/shared/src/components/BottomNav.tsx',
    variants: [
      { label: 'Salesperson: tap a tab, tap Check In to clock in and out, hold Briefing to change it', node: <NavDemo role="salesperson" /> },
      { label: 'Manager: Team, Customers, Check In, Approvals (badge 99+), Menu', node: <NavDemo role="manager" /> },
      { label: 'Clocked in, Check In open', node: <div className="w-[390px] max-w-full"><BottomNav tabs={tabsForRole('salesperson', { messages: 3 })} active="checkin" clockedIn /></div> },
      { label: 'Shortcut menu open (hold the tab after Check In)', node: <div className="w-[390px] max-w-full pt-[330px] [transform:translateZ(0)]"><BottomNav tabs={tabsForRole('salesperson', { messages: 3 })} active="calendar" shortcut={{ options: SHORTCUT_OPTIONS, onChange: () => {} }} defaultMenuOpen /></div> },
    ],
  },
  {
    id: 'trophies',
    name: 'Trophies',
    board: 'TrophyKit.dc.html · Trophies.dc.html · TrophySheet.dc.html · TrophyHistory.dc.html',
    source: 'packages/shared/src/components/Trophies.tsx',
    variants: [
      { label: 'Card for Today: tap a medal or Next unlocks, or the Last month footer for the history', node: frame(<div className="p-4"><TrophyCard progress={PREVIEW_TROPHIES} monthLabel="October" lastMonth={PREVIEW_LAST_MONTH} history={PREVIEW_HISTORY} overlay="absolute" /></div>, 760) },
      { label: 'The five trophies as tiles, English and Khmer', node: <TilesDemo /> },
      { label: 'Next unlocks sheet (How it is counted opens on Visits)', node: frame(<NextUnlocksSheet progress={PREVIEW_TROPHIES} monthLabel="October 2026" onClose={noop} overlay="absolute" defaultOpen="visits" />, 760) },
      { label: 'Trophy history sheet', node: frame(<TrophyHistorySheet months={PREVIEW_HISTORY} onClose={noop} overlay="absolute" />, 760) },
      { label: 'Details sheet: earned silver', node: frame(<TrophyDetailsSheet id="attendance" progress={PREVIEW_TROPHIES.attendance} monthLabel="October 2026" onClose={noop} overlay="absolute" />, 640) },
      { label: 'Details sheet: in progress', node: frame(<TrophyDetailsSheet id="visits" progress={PREVIEW_TROPHIES.visits} monthLabel="October 2026" onClose={noop} overlay="absolute" />, 640) },
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
    <div className="mx-auto max-w-[1500px] px-4 py-8">
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
