import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DaySummary } from '../DaySummary'
import { computeJourneyStats } from '../journeyStats'
import { DEFAULT_FLAG_RULES } from '../flagRules'
import type { AttendanceRow } from '../types'

// React wants this flag set to batch updates inside act() without warnings.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DaySummary info popup', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens the explanation, with the bands, from the info button and not before', async () => {
    const attendance = [{ clock_in_at: '2026-01-01T01:00:00Z', clock_out_at: '2026-01-01T10:00:00Z' }] as AttendanceRow[]
    const stats = computeJourneyStats([{ date: '2026-01-01', attendance, visits: [] }], 0, null, DEFAULT_FLAG_RULES)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<DaySummary stats={stats} rules={DEFAULT_FLAG_RULES} firstVisit={{ kind: 'ok' }} paidVisits={0} appointments={0} language="en" />)
    })
    expect(document.body.textContent).not.toContain('How the score works')

    const button = document.querySelector('button[aria-label="How the effectiveness score works"]') as HTMLButtonElement
    await act(async () => {
      button.click()
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('How the score works')
    expect(text).toContain('average of three parts')
    for (const band of ['Poor', 'Average', 'Good', 'Excellent']) expect(text).toContain(band)
    expect(text).toContain('Under 5')
    expect(text).toContain('Above 9')
    await act(async () => root.unmount())
  })
})
