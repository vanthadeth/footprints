import type { ReactNode } from 'react'
import { DayStrip } from '@/components/DayStrip'
import { hm, type StripDay } from '@/components/dayStrip'
import { ThemeToggle } from '@/components/ThemeToggle'

/** The design canvas the components are built from (Reusable Components page). */
const DESIGN_URL = 'https://claude.ai/artifact/6097a3bd-2ab7-4f7a-9e61-a8235eab334b'

const early: StripDay = {
  shiftStart: hm('08:00'),
  shiftEnd: hm('17:00'),
  clockIn: hm('07:45'),
  clockOut: hm('17:40'),
  visits: [
    { start: hm('08:10'), end: hm('08:14') },
    { start: hm('08:40'), end: hm('09:25') },
    { start: hm('09:50'), end: hm('11:05') },
    { start: hm('13:00'), end: hm('13:35') },
    { start: hm('14:00'), end: hm('14:40'), flagged: true },
    { start: hm('15:00'), end: hm('15:07') },
    { start: hm('15:30'), end: hm('16:15') },
  ],
}
const late: StripDay = {
  shiftStart: hm('08:00'),
  shiftEnd: hm('17:00'),
  clockIn: hm('09:20'),
  clockOut: hm('15:30'),
  visits: [
    { start: hm('09:50'), end: hm('09:54') },
    { start: hm('10:20'), end: hm('11:10') },
    { start: hm('11:40'), end: hm('12:10') },
    { start: hm('13:30'), end: hm('14:00'), flagged: true },
    { start: hm('14:20'), end: hm('14:23') },
  ],
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
]

/** Every built component on one page, light or dark with the toggle, each linked back to its design artboard. */
export function ComponentsPreviewPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ThemeToggle />
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
