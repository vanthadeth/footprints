import { describe, expect, it } from 'vitest'
import { countsText, newContact, newTab, scheduleText, tabProblem, whenText } from '../sheetSync'

describe('sheet sync page helpers', () => {
  it('says what the schedule means', () => {
    expect(scheduleText({ schedule: 'off', at_time: '06:00:00', weekday: 1 })).toBe('Only when you tap Sync now')
    expect(scheduleText({ schedule: 'daily', at_time: '06:30:00', weekday: 1 })).toBe('Every day at 06:30')
    expect(scheduleText({ schedule: 'weekly', at_time: '07:00', weekday: 5 })).toBe('Every Fri at 07:00')
  })

  it('shows times in Phnom Penh', () => {
    expect(whenText('2026-10-04T23:00:00Z')).toBe('Mon 5 Oct, 06:00')
    expect(whenText(null)).toBe('—')
  })

  it('counts a sync or a preview', () => {
    expect(countsText({ updated: 1204, created: 12, skipped: 3, unchanged: 780 })).toBe('Updated 1,204 · added 12 · 780 already up to date · skipped 3')
    expect(countsText({ updated: 5, created: 0, skipped: 0 }, true)).toBe('Would update 5 · add 0')
  })

  it('checks a tab before saving and fills a new one from the suggestion', () => {
    expect(tabProblem(newTab())).toBe('Paste a Google Sheets link')
    const url = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0'
    expect(tabProblem(newTab(url))).toBe('Pick the column that identifies each customer')
    expect(tabProblem({ ...newTab(url), key: { column: 'ID', matches: 'sheet_id' } })).toBe('Pick at least one column to sync')
    const t = newTab(url, { key: 'Row ID', fields: { balance: 'Balance' } })
    expect(t.key.column).toBe('Row ID')
    expect(tabProblem(t)).toBeNull()
  })

  it('counts contacts and checks contact slots', () => {
    expect(countsText({ updated: 2, created: 0, skipped: 0, unchanged: 10, contacts_updated: 3, contacts_created: 1 })).toBe('Updated 2 · added 0 · 10 already up to date · contacts: updated 3, added 1')
    const url = 'https://docs.google.com/spreadsheets/d/abc/edit'
    const t = newTab(url, { key: 'ID', fields: {}, contacts: [{ phone: 'PH1', label: 'PH1L', fallback: 'Phone 1' }] }, 'CUS')
    expect(t.tab).toBe('CUS')
    expect(tabProblem(t)).toBeNull()
    expect(tabProblem({ ...t, contacts: [...t.contacts!, newContact(2)] })).toBe('Pick the phone column for each contact')
    expect(tabProblem({ ...t, key: { column: 'Code', matches: 'code' } })).toBe('Contacts need the key column to be the sheet row ID')
    expect(newContact(2)).toEqual({ phone: '', label: null, fallback: 'Phone 2' })
  })
})
