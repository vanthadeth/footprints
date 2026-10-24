import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextUnlocksSheet, TrophyCard, TrophyDetailsSheet, TrophyHistorySheet, TrophyTiles } from '../Trophies'
import type { HistoryMonth, MonthProgress } from '../trophies'

const progress: MonthProgress = {
  sales: { actual: 5040, target: 6000 },
  visits: { actual: 102, target: 176 },
  newcustomer: { actual: 6, target: 6 },
  attendance: { actual: 95, lates: [12] },
  system: { actual: 71 },
}
const months: HistoryMonth[] = [
  { label: 'October 2026', inProgress: true, medals: [{ id: 'sales', tier: 'silver' }, { id: 'newcustomer', tier: 'gold' }] },
  { label: 'September 2026', medals: [{ id: 'sales', tier: 'gold' }, { id: 'attendance', tier: 'gold' }] },
  { label: 'February 2026', medals: [] },
]
const noop = () => {}

describe('<TrophyCard>', () => {
  const html = renderToStaticMarkup(<TrophyCard progress={progress} monthLabel="October" lastMonth={{ name: 'September', medals: [{ id: 'sales', tier: 'gold' }] }} history={months} />)
  it('shows the month, the count, and one medal per earned trophy', () => {
    expect(html).toContain('Trophies <span>· October · 3 of 5</span>')
    expect(html).toContain('aria-label="Sales target, silver"')
    expect(html).toContain('aria-label="New customer target, gold"')
    expect(html).toContain('aria-label="Attendance, silver"')
    expect(html).not.toContain('aria-label="Visit target')
    expect(html).toContain('<b>+2</b>')
    expect(html).toContain('Next unlocks')
  })
  it('has the last-month footer that opens the history, and no sheet until opened', () => {
    expect(html).toContain('Last month')
    expect(html).toContain('<b>September</b>')
    expect(html).toContain('aria-label="Trophy history, last 3 months"')
    expect(html).not.toContain('role="dialog"')
  })
  it('hides the +N tile when everything is earned, and the footer when there is no last month', () => {
    const all: MonthProgress = { sales: { actual: 6000, target: 6000 }, visits: { actual: 176, target: 176 }, newcustomer: { actual: 6, target: 6 }, attendance: { actual: 100 }, system: { actual: 95 } }
    const h = renderToStaticMarkup(<TrophyCard progress={all} monthLabel="October" />)
    expect(h).toContain('5 of 5')
    expect(h).not.toContain('to unlock')
    expect(h).not.toContain('Last month')
  })
  it('opens either sheet on first render', () => {
    expect(renderToStaticMarkup(<TrophyCard progress={progress} monthLabel="October" defaultSheet="unlocks" overlay="absolute" />)).toContain('aria-label="Next unlocks"')
    expect(renderToStaticMarkup(<TrophyCard progress={progress} monthLabel="October" history={months} defaultSheet="history" />)).toContain('aria-label="Trophy history"')
  })
})

describe('<NextUnlocksSheet>', () => {
  const html = renderToStaticMarkup(<NextUnlocksSheet progress={progress} monthLabel="October 2026" onClose={noop} defaultOpen="visits" />)
  it('lists all five trophies with status, chip, next unlock and need', () => {
    expect(html).toContain('October 2026 · 3 of 5 trophies earned')
    for (const n of ['Sales target', 'Visit target', 'New customer target', 'Attendance', 'System master']) expect(html).toContain(n)
    expect(html).toContain('84% of target · $5,040 of $6,000')
    expect(html).toContain('tr-chip tr-chip-silver">Silver')
    expect(html).toContain('tr-chip tr-chip-none">Not yet')
    expect(html).toContain('Next unlock: Gold')
    expect(html).toContain('Next unlock: Silver') // visits: nothing earned yet, so silver first
    expect(html).toContain('Next unlock: Master')
    expect(html).toContain('$960 more sales to reach 100%')
    expect(html).toContain('Top tier reached')
  })
  it('puts a tick on the bar for each tier and opens the chosen "How it is counted"', () => {
    expect(html).toContain('style="left:80%"')
    expect(html).toContain('style="left:90%"')
    expect(html.match(/<details open="">/g)).toHaveLength(1)
    expect(html).toContain('Visits that count (5 minutes or longer)')
  })
})

describe('<TrophyHistorySheet>', () => {
  const html = renderToStaticMarkup(<TrophyHistorySheet months={months} onClose={noop} />)
  it('totals the months and lists the medals or "No trophies"', () => {
    expect(html).toContain('Last 3 months · 4 trophies · 3 gold')
    expect(html).toContain('In progress · 2 trophies')
    expect(html).toContain('No trophies')
    expect(html).toContain('alt="Attendance, gold"')
  })
})

describe('<TrophyDetailsSheet>', () => {
  it('shows an earned silver with the gold tier still to go', () => {
    const html = renderToStaticMarkup(<TrophyDetailsSheet id="attendance" progress={progress.attendance} monthLabel="October 2026" onClose={noop} />)
    expect(html).toContain('Attendance · Silver')
    expect(html).toContain('Earned · October 2026')
    expect(html).toContain('95% attendance')
    expect(html).toContain('1 late (12 minutes), no absence')
    expect(html).toContain('100%: no late, no absent')
    expect(html).toContain('5 pts to go')
    expect(html).toContain('>Earned<')
    expect(html).toContain('Gold needs a month with no late and no absent.')
  })
  it('shows a trophy in progress with both tiers and the next step', () => {
    const html = renderToStaticMarkup(<TrophyDetailsSheet id="visits" progress={progress.visits} monthLabel="October 2026" onClose={noop} />)
    expect(html).toContain('Visit target · in progress')
    expect(html).toContain('Not earned yet · October 2026')
    expect(html).toContain('58% of target')
    expect(html).toContain('102 of 176 visits this month')
    expect(html).toContain('74 more')
    expect(html).toContain('39 more')
    expect(html).toContain('39 more visits to reach Silver.')
  })
  it('has a single tier for new customers', () => {
    const html = renderToStaticMarkup(<TrophyDetailsSheet id="newcustomer" progress={progress.newcustomer} monthLabel="October 2026" onClose={noop} />)
    expect(html).not.toContain('>Silver<')
    expect(html).toContain('Top tier reached. Keep it up.')
  })
})

describe('<TrophyTiles>', () => {
  it('shows a label, a medal, a bar and what is missing, and no bar for a finished trophy', () => {
    const html = renderToStaticMarkup(<TrophyTiles progress={progress} />)
    expect(html.match(/class="tr-tile"/g)).toHaveLength(5)
    expect(html).toContain('>Sales<')
    expect(html).toContain('>$960 more<')
    expect(html).toContain('>19 pts more<')
    expect(html.match(/class="tr-pbar"/g)).toHaveLength(4) // New customer is done
  })
  it('switches the labels to Khmer', () => {
    const html = renderToStaticMarkup(<TrophyTiles progress={progress} lang="km" />)
    expect(html).toContain('>លក់<')
    expect(html).toContain('>ប្រព័ន្ធ<')
    expect(html).toContain('ត្រូវការ $960 ទៀត')
  })
})
