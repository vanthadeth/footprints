import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamOverview } from '../TeamOverview'
import { TeamPerformance } from '../TeamPerformance'
import { performance } from '../teamOverview'
import { PREVIEW_OVERVIEW, PREVIEW_PERFORMANCE } from '../../pages/componentsPreviewData'

describe('<TeamOverview>', () => {
  const html = renderToStaticMarkup(<TeamOverview people={PREVIEW_OVERVIEW} />)
  it('has four filter tiles with the numbers', () => {
    expect(html).toContain('aria-label="Clocked in: 6, of 9 people"')
    expect(html).toContain('aria-label="On leave: 2, AL 1 · SL 1"')
    expect(html).toContain('aria-label="Absent: 1, no clock-in, not on leave"')
    expect(html).toContain('aria-label="Late: 3, 67 min in total"')
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4)
  })
  it('lists everyone with the problems first', () => {
    expect(html).toContain('Your team <span>· 9</span>')
    expect(html.match(/class="tov-person"/g)).toHaveLength(9)
    expect(html.indexOf('Heng Vuthy')).toBeLessThan(html.indexOf('Sok Dara'))
    expect(html).toContain('Late 40m')
    expect(html).toContain('>Absent<')
    expect(html).toContain('On leave · SL')
    expect(html).toContain('Tap a number to filter')
  })
  it('groups the people by department with a count', () => {
    for (const d of ['Distribution', 'Merchandising', 'Sales']) expect(html).toContain(`<div class="tov-gh"><b>${d}</b><span>3</span></div>`)
    expect(html.indexOf('Distribution')).toBeLessThan(html.indexOf('Merchandising'))
  })
  it('gives each person who is in a status line, chip and the day numbers as pills', () => {
    expect(html).toContain('Clocked in 07:52')
    expect(html).toContain('>On time<')
    expect(html).toContain('>5 unique visits<')
    expect(html).toContain('>3 orders<')
    expect(html).toContain('tov-pl tov-amt">$820<')
    expect(html.match(/class="tov-inf"/g)).toHaveLength(6)
  })
  it('draws the day strip for people clocked in only', () => {
    expect(html.match(/aria-label="Day timeline"/g)).toHaveLength(6)
  })
  it('starts filtered when asked, with the count and a Clear button', () => {
    const late = renderToStaticMarkup(<TeamOverview people={PREVIEW_OVERVIEW} defaultFilter="late" />)
    expect(late).toContain('Showing 3 of 9')
    expect(late).toContain('>Clear<')
    expect(late.match(/class="tov-person"/g)).toHaveLength(3)
    expect(late.match(/class="tov-gh"/g)).toHaveLength(3)
    const absent = renderToStaticMarkup(<TeamOverview people={PREVIEW_OVERVIEW} defaultFilter="absent" />)
    expect(absent.match(/class="tov-gh"/g)).toHaveLength(1)
    expect(absent).not.toContain('<b>Merchandising</b>')
    expect(late).toContain('aria-pressed="true"')
  })
  it('shows the empty state when nobody reports to the manager', () => {
    const none = renderToStaticMarkup(<TeamOverview people={[]} />)
    expect(none).toContain('No one reports to you yet')
    expect(none).toContain('no one yet')
    expect(none).not.toContain('tov-person')
  })
})

describe('<TeamPerformance>', () => {
  it('shows sales against target with a pace tick, visits and new customers', () => {
    const html = renderToStaticMarkup(<TeamPerformance performance={performance(PREVIEW_PERFORMANCE)} />)
    expect(html).toContain('$4,300')
    expect(html).toContain('86% of target')
    expect(html).toContain('Target $5,000')
    expect(html).not.toContain('tpf-mark')
    expect(html).not.toContain('pace')
    expect(html).toContain('of 40')
    expect(html).toContain('of 6')
  })
  it('shows only the numbers when no targets are set', () => {
    const html = renderToStaticMarkup(<TeamPerformance performance={performance({ ...PREVIEW_PERFORMANCE, salesTarget: null, visitTarget: null, newTarget: null })} />)
    expect(html).toContain('No target set')
    expect(html).not.toContain('tpf-bar')
    expect(html).not.toContain('tpf-pb')
    expect(html).toContain('No target set')
  })
})

describe('<TeamOverview> waiting people', () => {
  it('shows the note on a neutral track and counts them only in the team', () => {
    const html = renderToStaticMarkup(<TeamOverview people={[...PREVIEW_OVERVIEW, { id: 'w', name: 'Early Bird', department: '', state: 'waiting', lateMinutes: 0, note: 'Starts at 14:00' }]} />)
    expect(html).toContain('Your team <span>· 10</span>')
    expect(html).toContain('Starts at 14:00')
    expect(html).toContain('aria-label="Clocked in: 6, of 10 people"')
    expect(html).toContain('aria-label="Early Bird, not due yet, starts at 14:00"')
  })
})
