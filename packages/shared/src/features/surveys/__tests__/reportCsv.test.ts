import { describe, expect, it } from 'vitest'
import { csvField, exportRows, toCsv } from '../reportCsv'
import type { SurveyFeedRow, SurveyQuestion } from '../types'

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
    expect(csvField(null)).toBe('')
    expect(csvField(4.2)).toBe('4.2')
  })

  it('defuses spreadsheet formulas in text', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField('@cmd')).toBe("'@cmd")
    expect(csvField(-3)).toBe('-3')
  })

  it('joins rows with CRLF and ends with one', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n')
  })
})

const feed = (id: string): SurveyFeedRow => ({
  id,
  template_id: 't',
  template_title: 'Noodles',
  template_title_alt: null,
  target_kind: 'category',
  target_name: 'Instant noodles',
  customer_id: 'c',
  customer_name: 'Sokha Mini Mart',
  user_id: 'u',
  user_name: 'Dara',
  visit_id: id === 's1' ? 'v' : null,
  surveyed_at: '2026-11-04T03:00:00Z',
  status: 'submitted',
  submitted_at: '2026-11-04T03:05:00Z',
  remarks: null,
  headline: null,
  headline_alt: null,
  headline_key: null,
  brand_count: 0,
  editable: false,
})

const questions: SurveyQuestion[] = [
  { id: 'q1', version_id: 'v1', sort_order: 1, type: 'single', label: 'Sells it?', label_alt: null, required: true, options: [{ key: 'yes', label: 'Yes' }] },
  { id: 'q2', version_id: 'v1', sort_order: 2, type: 'multi', label: 'Likes', label_alt: null, required: false, options: [{ key: 'fast', label: 'Fast seller' }, { key: 'design', label: 'Nice design' }] },
  { id: 'q3', version_id: 'v1', sort_order: 3, type: 'brand_price', label: 'Brands', label_alt: null, required: false, options: [] },
  { id: 'q1b', version_id: 'v2', sort_order: 1, type: 'single', label: 'Sells it?', label_alt: null, required: true, options: [{ key: 'yes', label: 'Yes' }] },
]

describe('exportRows', () => {
  it('one row per survey, columns grouped by question text across versions, labels instead of keys', () => {
    const rows = exportRows({
      surveys: [feed('s1'), feed('s2')],
      questions,
      answers: [
        { survey_id: 's1', question_id: 'q1', value_text: 'yes', value_number: null, value_json: null },
        { survey_id: 's1', question_id: 'q2', value_text: null, value_number: null, value_json: ['fast', 'design'] },
        { survey_id: 's2', question_id: 'q1b', value_text: 'yes', value_number: null, value_json: null },
      ],
      brandPrices: [
        { id: 'b1', survey_id: 's1', question_id: 'q3', brand_id: 'mama', brand_other: null, price_usd: 4.2, unit: 'box' },
        { id: 'b2', survey_id: 's1', question_id: 'q3', brand_id: null, brand_other: 'Other Co', price_usd: 3.5, unit: 'piece' },
      ],
      brandNames: { mama: 'Mama' },
    })
    expect(rows[0]).toEqual(['Surveyed at', 'Customer', 'Salesperson', 'Template', 'Target', 'Linked to visit', 'Sells it?', 'Likes', 'Brands'])
    expect(rows[1].slice(6)).toEqual(['Yes', 'Fast seller; Nice design', 'Mama (box) $4.20 | Other Co (piece) $3.50'])
    expect(rows[1][5]).toBe('yes')
    expect(rows[2].slice(5)).toEqual(['no', 'Yes', '', ''])
  })
})
