import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamAttendanceCalendar, TeamCalendar } from '../TeamCalendar'
import { previewRoster } from '../../pages/componentsPreviewData'

const data = previewRoster()

describe('<TeamAttendanceCalendar>', () => {
  const html = renderToStaticMarkup(<TeamAttendanceCalendar data={data} value="2026-10-16" />)
  it('titles the month, lists every person and day, and has four tiles', () => {
    expect(html).toContain('Team attendance · October 2026')
    for (const n of ['Sok Dara', 'Noun Chenda']) expect(html).toContain(`<b>${n}</b>`)
    for (const g of ['Sales', 'Merchandising', 'Distribution']) expect(html).toContain(`<b>${g}</b>`)
    expect(html.match(/class="ros-ce /g)).toHaveLength(8 * 31)
    expect(html).toContain('Late or early')
    expect(html).toContain('Absent days')
  })
  it('writes the marks and the row totals', () => {
    expect(html).toContain('aria-label="Sok Dara, 6 October 2026: late or early, 18 minutes in total"')
    expect(html).toContain('>18m<')
    expect(html).toContain('>AL<')
    expect(html).toContain('>SL<')
    expect(html).toContain('>UL<')
    expect(html).toContain('PRESENT')
    expect(html).toContain('LATE MIN')
  })
  it('marks the selected and today headers, never the cells', () => {
    expect(html).toContain('ros-hd ros-t')
    expect(html).toContain('ros-hd ros-s')
    expect(html).not.toMatch(/class="ros-ce[^"]*ros-s/)
  })
  it('has a day list for the selected date, with status chips', () => {
    expect(html).toContain('Friday 16 Oct 2026')
    expect(html).toContain('Late 8m')
    expect(html).toContain('On time')
  })
  it('renders the week without totals', () => {
    const week = renderToStaticMarkup(<TeamAttendanceCalendar data={data} defaultView="week" value="2026-10-16" />)
    expect(week).toContain('12 to 18 Oct 2026')
    expect(week.match(/class="ros-ce /g)).toHaveLength(8 * 7)
    expect(week).not.toContain('LATE MIN')
  })
})

describe('<TeamCalendar>', () => {
  it('shows dots for days with visits, five tiles, and visits and orders in the day panel', () => {
    const html = renderToStaticMarkup(<TeamCalendar data={data} value="2026-10-16" />)
    expect(html).toContain('Team calendar · October 2026')
    expect(html).toContain('ros-dot')
    expect(html).toContain('Visits vs target')
    expect(html).toContain('Orders')
    expect(html).toContain('Collection')
    expect(html).toContain('Appointments')
    expect(html).not.toContain('LATE MIN') // no per-row totals in this view
    expect(html).not.toContain('>18m<')
  })
  it('shows visits and the order amount in each week cell', () => {
    const html = renderToStaticMarkup(<TeamCalendar data={data} defaultView="week" value="2026-10-16" />)
    expect(html).toMatch(/>\d · \$\d+</)
  })
})
