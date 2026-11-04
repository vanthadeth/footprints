import { describe, expect, it } from 'vitest'
import {
  brandLineComplete,
  buildAnswers,
  buildBrandPrices,
  emptyForm,
  formFromStored,
  hasIncompleteBrandLine,
  isAnswered,
  localized,
  missingRequired,
  moveItem,
  newBrandLine,
  newQuestionDraft,
  optionKey,
  parsePrice,
  progress,
  questionsPayload,
  templateProblem,
  toggleKey,
} from '../surveyForm'
import type { SurveyQuestion } from '../types'

const q = (id: string, type: SurveyQuestion['type'], extra: Partial<SurveyQuestion> = {}): SurveyQuestion => ({
  id,
  version_id: 'v1',
  sort_order: 1,
  type,
  label: id,
  label_alt: null,
  required: false,
  options: [],
  ...extra,
})

describe('localized', () => {
  it('prefers the Khmer text in Khmer, falls back to English', () => {
    expect(localized('Yes', 'បាទ', 'km')).toBe('បាទ')
    expect(localized('Yes', null, 'km')).toBe('Yes')
    expect(localized('Yes', '  ', 'km')).toBe('Yes')
    expect(localized('Yes', 'បាទ', 'en')).toBe('Yes')
  })
})

describe('parsePrice', () => {
  it('accepts plain, comma and dollar-prefixed amounts', () => {
    expect(parsePrice('4.20')).toBe(4.2)
    expect(parsePrice('4,2')).toBe(4.2)
    expect(parsePrice('$4')).toBe(4)
    expect(parsePrice(' 0 ')).toBe(0)
  })
  it('rejects empty, negative, text and more than two decimals', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('-1')).toBeNull()
    expect(parsePrice('abc')).toBeNull()
    expect(parsePrice('1.234')).toBeNull()
  })
})

describe('brand lines', () => {
  it('needs a brand (listed or typed) and a valid price', () => {
    const l = newBrandLine('b')
    expect(brandLineComplete(l)).toBe(false)
    expect(brandLineComplete({ ...l, brandId: 'x', price: '4.2' })).toBe(true)
    expect(brandLineComplete({ ...l, brandOther: 'Other Co', price: '3' })).toBe(true)
    expect(brandLineComplete({ ...l, brandOther: 'Other Co', price: '' })).toBe(false)
  })

  it('a blank line is dropped silently; a half-filled one is reported', () => {
    const f = emptyForm()
    f.brands = [newBrandLine('b')]
    expect(hasIncompleteBrandLine(f)).toBe(false)
    f.brands = [{ ...newBrandLine('b'), brandOther: 'X' }]
    expect(hasIncompleteBrandLine(f)).toBe(true)
  })
})

describe('required questions', () => {
  const qs = [
    q('sells', 'single', { required: true }),
    q('rate', 'rating', { required: true }),
    q('likes', 'multi'),
    q('brands', 'brand_price', { required: true }),
    q('shelf', 'photo', { required: true }),
  ]

  it('lists every unanswered required question in order', () => {
    expect(missingRequired(qs, emptyForm()).map((x) => x.id)).toEqual(['sells', 'rate', 'brands', 'shelf'])
  })

  it('a rating of 0 stars is not an answer, but a number 0 is', () => {
    const f = emptyForm()
    f.number.rate = null
    expect(isAnswered(q('rate', 'rating'), f)).toBe(false)
    f.number.rate = 0
    expect(isAnswered(q('n', 'number'), { ...f, number: { n: 0 } })).toBe(true)
  })

  it('counts answers, complete brand lines and photos', () => {
    const f = emptyForm()
    f.text.sells = 'yes'
    f.number.rate = 4
    f.brands = [{ ...newBrandLine('brands'), brandId: 'm', price: '4.2' }]
    f.photos.shelf = 1
    expect(missingRequired(qs, f)).toEqual([])
    expect(progress(qs, f)).toEqual({ done: 4, total: 5 })
  })

  it('an incomplete brand line does not satisfy a required brand question', () => {
    const f = emptyForm()
    f.brands = [{ ...newBrandLine('brands'), brandOther: 'X' }]
    expect(isAnswered(q('brands', 'brand_price'), f)).toBe(false)
  })
})

describe('payloads', () => {
  const qs = [q('sells', 'single'), q('rate', 'rating'), q('likes', 'multi'), q('note', 'text'), q('brands', 'brand_price')]

  it('sends only answered questions', () => {
    const f = emptyForm()
    f.text.sells = 'yes'
    f.text.note = '  '
    f.number.rate = 3
    f.multi.likes = ['fast', 'design']
    expect(buildAnswers(qs, f)).toEqual([
      { question_id: 'sells', value_text: 'yes' },
      { question_id: 'rate', value_number: 3 },
      { question_id: 'likes', value_json: ['fast', 'design'] },
    ])
  })

  it('sends complete brand lines only, with the typed brand only when no listed brand is chosen', () => {
    const f = emptyForm()
    f.brands = [
      { ...newBrandLine('brands'), brandId: 'mama', brandOther: 'ignored', price: '4.20', unit: 'box' },
      { ...newBrandLine('brands'), brandOther: ' Other Co ', price: '3.5' },
      newBrandLine('brands'),
    ]
    expect(buildBrandPrices(f)).toEqual([
      { question_id: 'brands', brand_id: 'mama', brand_other: null, price_usd: 4.2, unit: 'box' },
      { question_id: 'brands', brand_id: null, brand_other: 'Other Co', price_usd: 3.5, unit: 'piece' },
    ])
  })

  it('round-trips through a saved survey', () => {
    const f = formFromStored(
      qs,
      [
        { survey_id: 's', question_id: 'sells', value_text: 'yes', value_number: null, value_json: null },
        { survey_id: 's', question_id: 'rate', value_text: null, value_number: 4, value_json: null },
        { survey_id: 's', question_id: 'likes', value_text: null, value_number: null, value_json: ['fast'] },
      ],
      [{ id: 'p', survey_id: 's', question_id: 'brands', brand_id: null, brand_other: 'Other Co', price_usd: 3.5, unit: 'carton' }],
      { shelf: 2 },
      'ok'
    )
    expect(f.text.sells).toBe('yes')
    expect(f.number.rate).toBe(4)
    expect(f.multi.likes).toEqual(['fast'])
    expect(f.brands[0]).toMatchObject({ brandOther: 'Other Co', price: '3.50', unit: 'carton' })
    expect(f.photos.shelf).toBe(2)
    expect(f.remarks).toBe('ok')
  })
})

describe('toggleKey / moveItem', () => {
  it('toggles membership', () => {
    expect(toggleKey(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleKey(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('moves within bounds only', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
    expect(moveItem([1, 2, 3], 2, 3)).toEqual([1, 2, 3])
  })
})

describe('template builder', () => {
  it('derives stable unique option keys', () => {
    expect(optionKey('Fast seller', [])).toBe('fast_seller')
    expect(optionKey('Fast seller', ['fast_seller'])).toBe('fast_seller_2')
    expect(optionKey('ល្អ', [])).toBe('option')
  })

  it('reports why a template cannot be saved', () => {
    const choice = { ...newQuestionDraft('single'), label: 'Sells it?' }
    expect(templateProblem('', [choice])).toMatch(/title/)
    expect(templateProblem('T', [])).toMatch(/at least one question/)
    expect(templateProblem('T', [newQuestionDraft('text')])).toMatch(/Question 1 needs a text/)
    expect(templateProblem('T', [choice])).toMatch(/two options/)
    const ok = { ...choice, options: choice.options.map((o, i) => ({ ...o, label: i === 0 ? 'Yes' : 'No' })) }
    expect(templateProblem('T', [ok])).toBeNull()
  })

  it('builds the RPC payload: blank options dropped, unique keys, non-choice questions carry none', () => {
    const single = {
      ...newQuestionDraft('single'),
      label: ' Sells it? ',
      required: true,
      options: [
        { uid: 'a', key: '', label: 'Yes', label_alt: '' },
        { uid: 'b', key: '', label: 'Yes', label_alt: 'បាទ' },
        { uid: 'c', key: '', label: '', label_alt: '' },
      ],
    }
    const text = { ...newQuestionDraft('text'), label: 'Note' }
    expect(questionsPayload([single, text])).toEqual([
      {
        type: 'single',
        label: 'Sells it?',
        label_alt: null,
        required: true,
        options: [
          { key: 'yes', label: 'Yes', label_alt: null },
          { key: 'yes_2', label: 'Yes', label_alt: 'បាទ' },
        ],
      },
      { type: 'text', label: 'Note', label_alt: null, required: false, options: [] },
    ])
  })
})
