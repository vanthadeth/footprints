import { describe, expect, it } from 'vitest'
import { filterEntries, missingPlaceholders, placeholdersOf } from '../translationEdit'

const e = (key: string, english: string, khmerDefault = 'ខ្មែរ') => ({ key, namespace: key.split('.')[0], english, khmerDefault })

describe('placeholders', () => {
  it('lists each slot once', () => {
    expect(placeholdersOf('Step {{n}} of {{total}} ({{n}})')).toEqual(['n', 'total'])
    expect(placeholdersOf('No slots')).toEqual([])
  })
  it('finds slots the Khmer dropped', () => {
    expect(missingPlaceholders('Late in · {{time}}', 'ចូលយឺត')).toEqual(['time'])
    expect(missingPlaceholders('Late in · {{time}}', 'ចូលយឺត · {{ time }}')).toEqual([])
    expect(missingPlaceholders('Plain', 'អត្ថបទ')).toEqual([])
  })
})

describe('filterEntries', () => {
  const entries = [e('checkIn.alertLateIn', 'Late in · {{time}}', 'ចូលយឺត · {{time}}'), e('nav.home', 'Home', 'ទំព័រដើម'), e('visitOption:1', 'Ordered', 'បានបញ្ជាទិញ')]
  const cur = (x: { khmerDefault: string }) => x.khmerDefault
  const edited = (x: { key: string }) => x.key === 'nav.home'
  it('applies the chip', () => {
    expect(filterEntries(entries, 'all', '', cur, edited)).toHaveLength(3)
    expect(filterEntries(entries, 'edited', '', cur, edited).map((x) => x.key)).toEqual(['nav.home'])
    expect(filterEntries(entries, 'visit', '', cur, edited).map((x) => x.key)).toEqual(['visitOption:1'])
    expect(filterEntries(entries, 'placeholders', '', cur, edited).map((x) => x.key)).toEqual(['checkIn.alertLateIn'])
  })
  it('searches key, English and Khmer', () => {
    expect(filterEntries(entries, 'all', 'LATE', cur, edited)).toHaveLength(1)
    expect(filterEntries(entries, 'all', 'ទំព័រ', cur, edited).map((x) => x.key)).toEqual(['nav.home'])
    expect(filterEntries(entries, 'all', 'nav.', cur, edited)).toHaveLength(1)
    expect(filterEntries(entries, 'all', 'zzz', cur, edited)).toHaveLength(0)
  })
})
