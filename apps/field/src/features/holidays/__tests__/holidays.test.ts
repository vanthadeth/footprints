import { describe, expect, it } from 'vitest'
import { daysUntil, groupByMonth, holidayDayCount, nextHoliday, suggestedCambodiaHolidays, type Holiday } from '../holidays'

const list: Holiday[] = suggestedCambodiaHolidays(2026).map((h, i) => ({ ...h, id: String(i) }))

describe('holidays', () => {
  it('counts days, halving a half day', () => {
    expect(holidayDayCount({ startDate: '2026-04-14', endDate: '2026-04-16', halfDay: false })).toBe(3)
    expect(holidayDayCount({ startDate: '2026-12-31', endDate: '2026-12-31', halfDay: true })).toBe(0.5)
  })

  it('groups by month in date order', () => {
    const groups = groupByMonth(list)
    expect(groups.map((g) => g.label)).toEqual(['January', 'March', 'April', 'May', 'September', 'October', 'November'])
    expect(groups[0].items.map((h) => h.name)).toEqual(['International New Year Day', 'Victory over Genocide Day'])
  })

  it('finds the next holiday still to come', () => {
    expect(nextHoliday(list, '2026-09-27')?.name).toBe('King Father’s Commemoration Day')
    expect(nextHoliday(list, '2026-04-15')?.name).toBe('Khmer New Year')
    expect(nextHoliday(list, '2026-11-10')).toBeNull()
    expect(daysUntil('2026-09-27', '2026-10-15')).toBe(18)
  })
})
