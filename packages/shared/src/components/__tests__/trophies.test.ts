import { describe, expect, it } from 'vitest'
import {
  earnedTier, historySub, historyTotals, monthSummary, needText, nextLine, nextTier, tierName, tierToGo, percentOf, remaining, statusText, tierBar, tierLabel, tileState, tileSub, trophyDef,
  type MonthProgress, type HistoryMonth,
} from '../trophies'

const sales = trophyDef('sales')
const visits = trophyDef('visits')
const newc = trophyDef('newcustomer')
const att = trophyDef('attendance')
const sys = trophyDef('system')

describe('percentOf and earnedTier', () => {
  it('works out the percentage of target, or takes the rate as it is', () => {
    expect(percentOf(sales, { actual: 5040, target: 6000 })).toBe(84)
    expect(percentOf(visits, { actual: 102, target: 176 })).toBe(58)
    expect(percentOf(sys, { actual: 71 })).toBe(71)
    expect(percentOf(sales, { actual: 10, target: 0 })).toBe(0)
  })
  it('gives gold at 100%, silver at 80%, and nothing below', () => {
    expect(earnedTier(sales, { actual: 6000, target: 6000 })).toBe('gold')
    expect(earnedTier(sales, { actual: 4800, target: 6000 })).toBe('silver')
    expect(earnedTier(sales, { actual: 4799, target: 6000 })).toBeNull() // 79.98% shows as 80% but has not reached it
    expect(percentOf(sales, { actual: 4799, target: 6000 })).toBe(80)
  })
  it('has no silver for new customers and system master', () => {
    expect(earnedTier(newc, { actual: 5, target: 6 })).toBeNull()
    expect(earnedTier(newc, { actual: 6, target: 6 })).toBe('gold')
    expect(earnedTier(sys, { actual: 89 })).toBeNull()
    expect(earnedTier(sys, { actual: 90 })).toBe('gold')
  })
  it('gives attendance gold for a perfect month, silver for 95% with up to 2 lates under 30 minutes', () => {
    expect(earnedTier(att, { actual: 100 })).toBe('gold')
    expect(earnedTier(att, { actual: 95, lates: [12] })).toBe('silver')
    expect(earnedTier(att, { actual: 95, lates: [12, 29] })).toBe('silver')
    expect(earnedTier(att, { actual: 95, lates: [12, 29, 5] })).toBeNull() // three lates
    expect(earnedTier(att, { actual: 95, lates: [30] })).toBeNull() // a late of 30 minutes
    expect(earnedTier(att, { actual: 94, lates: [] })).toBeNull()
    expect(earnedTier(att, { actual: 100, absences: 1 })).toBe('silver') // an absence blocks gold; 95% is still met
  })
})

describe('next tier, bars and what is missing', () => {
  it('goes silver, then gold, then stops', () => {
    expect(nextTier(sales, null)).toBe('silver')
    expect(nextTier(sales, 'silver')).toBe('gold')
    expect(nextTier(sales, 'gold')).toBeNull()
    expect(nextTier(newc, null)).toBe('gold') // no silver tier
  })
  it('scales each tier bar to its own threshold', () => {
    expect(tierBar(visits, { actual: 102, target: 176 }, 'gold')).toBe(58)
    expect(tierBar(visits, { actual: 102, target: 176 }, 'silver')).toBe(72.4) // exact 57.95 / 80, not the rounded 58 / 80
    expect(tierBar(sales, { actual: 7000, target: 6000 }, 'gold')).toBe(100)
  })
  it('counts the units or points still missing', () => {
    expect(remaining(sales, { actual: 5040, target: 6000 }, 'gold')).toBe(960)
    expect(remaining(visits, { actual: 102, target: 176 }, 'gold')).toBe(74)
    expect(remaining(visits, { actual: 102, target: 176 }, 'silver')).toBe(39)
    expect(remaining(sys, { actual: 71 }, 'gold')).toBe(19)
    expect(remaining(sales, { actual: 9999, target: 6000 }, 'gold')).toBe(0)
  })
  it('writes the next-unlock wording', () => {
    expect(needText(sales, { actual: 5040, target: 6000 }, 'gold')).toBe('$960 more sales to reach 100%')
    expect(needText(visits, { actual: 102, target: 176 }, 'gold')).toBe('74 more visits to reach 100%')
    expect(needText(visits, { actual: 102, target: 176 }, 'silver')).toBe('39 more visits to reach 80%')
    expect(needText(sys, { actual: 71 }, 'gold')).toBe('19 points more accuracy to reach 90%')
    expect(needText(att, { actual: 95, lates: [12] }, 'gold')).toBe('Gold needs a month with no late and no absent')
    expect(needText(att, { actual: 90, lates: [] }, 'silver')).toBe('5 points more attendance to reach 95%')
  })
})

describe('texts', () => {
  it('writes the status line', () => {
    expect(statusText(sales, { actual: 5040, target: 6000 })).toBe('84% of target · $5,040 of $6,000')
    expect(statusText(visits, { actual: 102, target: 176 })).toBe('58% of target · 102 of 176 visits')
    expect(statusText(newc, { actual: 6, target: 6 })).toBe('100% of target · 6 of 6 new customers')
    expect(statusText(att, { actual: 95, lates: [12] })).toBe('95% · 1 late (12 min), no absent')
    expect(statusText(att, { actual: 100 })).toBe('100% · no late, no absent')
    expect(statusText(att, { actual: 90, lates: [10, 20], absences: 1 })).toBe('90% · 2 late (30 min), 1 absent')
    expect(statusText(sys, { actual: 71 })).toBe('71% accuracy using the system')
  })
  it('labels tiers and tile subtitles in English and Khmer', () => {
    expect([tierLabel('gold'), tierLabel('silver'), tierLabel(null)]).toEqual(['Gold', 'Silver', 'Not yet'])
    expect(tileSub(sales, { actual: 5040, target: 6000 })).toBe('$960 more')
    expect(tileSub(visits, { actual: 102, target: 176 })).toBe('39 more') // silver comes first
    expect(tileSub(newc, { actual: 6, target: 6 })).toBe('100%')
    expect(tileSub(att, { actual: 95, lates: [12] })).toBe('95%')
    expect(tileSub(sys, { actual: 71 })).toBe('19 pts more')
    expect(tileSub(sales, { actual: 5040, target: 6000 }, 'km')).toBe('ត្រូវការ $960 ទៀត')
    expect(tileSub(visits, { actual: 102, target: 176 }, 'km')).toBe('ត្រូវការ 39 ទៀត')
    expect(tileSub(sys, { actual: 71 }, 'km')).toBe('ត្រូវការ 19 ពិន្ទុ ទៀត')
  })
})

describe('details sheet wording', () => {
  it('writes the bold next-step line', () => {
    expect(nextLine(visits, { actual: 102, target: 176 })).toBe('39 more visits to reach Silver.')
    expect(nextLine(sales, { actual: 5040, target: 6000 })).toBe('$960 more sales to reach Gold.')
    expect(nextLine(sys, { actual: 71 })).toBe('19 points more accuracy to reach Master.')
    expect(nextLine(att, { actual: 95, lates: [12] })).toBe('Gold needs a month with no late and no absent.')
    expect(nextLine(newc, { actual: 6, target: 6 })).toBe('Top tier reached. Keep it up.')
  })
  it('names tiers and the short amount to go', () => {
    expect([tierName(sys, 'gold'), tierName(sales, 'gold'), tierName(sales, 'silver')]).toEqual(['Master', 'Gold', 'Silver'])
    expect(tierToGo(visits, { actual: 102, target: 176 }, 'silver')).toBe('39 more')
    expect(tierToGo(sales, { actual: 5040, target: 6000 }, 'gold')).toBe('$960 more')
    expect(tierToGo(att, { actual: 95, lates: [12] }, 'gold')).toBe('5 pts to go')
  })
})

describe('the month and the history', () => {
  const progress: MonthProgress = {
    sales: { actual: 5040, target: 6000 },
    visits: { actual: 102, target: 176 },
    newcustomer: { actual: 6, target: 6 },
    attendance: { actual: 95, lates: [12] },
    system: { actual: 71 },
  }
  it('lists the medals earned and how many are left', () => {
    const s = monthSummary(progress)
    expect(s.medals).toEqual([{ id: 'sales', tier: 'silver' }, { id: 'newcustomer', tier: 'gold' }, { id: 'attendance', tier: 'silver' }])
    expect([s.count, s.total, s.toUnlock]).toEqual([3, 5, 2])
  })
  it('names each tile state', () => {
    expect(tileState(sales, progress.sales)).toBe('earned')
    expect(tileState(visits, progress.visits)).toBe('progress')
    expect(tileState(sys, { actual: 0 })).toBe('notStarted')
  })
  it('describes and totals the history months', () => {
    const months: HistoryMonth[] = [
      { label: 'October 2026', inProgress: true, medals: [{ id: 'sales', tier: 'silver' }, { id: 'newcustomer', tier: 'gold' }] },
      { label: 'September 2026', medals: [{ id: 'sales', tier: 'gold' }] },
      { label: 'August 2026', medals: [] },
    ]
    expect(months.map(historySub)).toEqual(['In progress · 2 trophies', '1 trophy', 'No trophies'])
    expect(historyTotals(months)).toEqual({ trophies: 3, gold: 2 })
  })
})
