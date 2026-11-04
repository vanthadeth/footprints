import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '@footprints/shared/i18n/LanguageContext'
import { emptyForm, newBrandLine } from '@footprints/shared/features/surveys/surveyForm'
import type { FormState, SurveyQuestion } from '@footprints/shared/features/surveys/types'
import { SurveyQuestionField } from '../SurveyQuestionField'

const q = (type: SurveyQuestion['type'], extra: Partial<SurveyQuestion> = {}): SurveyQuestion => ({
  id: `q-${type}`,
  version_id: 'v',
  sort_order: 1,
  type,
  label: `Question ${type}`,
  label_alt: null,
  required: false,
  options: [],
  ...extra,
})

function render(question: SurveyQuestion, form: FormState = emptyForm(), readOnly = false) {
  return renderToStaticMarkup(
    <LanguageProvider>
      <SurveyQuestionField question={question} form={form} setForm={() => {}} brands={[{ id: 'b1', name: 'Mama' }]} photos={[]} readOnly={readOnly} ensureSaved={async () => null} />
    </LanguageProvider>
  )
}

describe('SurveyQuestionField', () => {
  it('renders a radio per option for single choice, marking the chosen one', () => {
    const html = render(q('single', { options: [{ key: 'yes', label: 'Yes, sells it' }, { key: 'no', label: 'No' }] }), { ...emptyForm(), text: { 'q-single': 'yes' } })
    expect(html).toContain('Yes, sells it')
    expect(html.match(/role="radio"/g)).toHaveLength(2)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
  })

  it('renders multi choice as toggle chips with the chosen ones pressed', () => {
    const html = render(q('multi', { options: [{ key: 'fast', label: 'Fast seller' }, { key: 'design', label: 'Nice design' }] }), { ...emptyForm(), multi: { 'q-multi': ['fast'] } })
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('Nice design')
  })

  it('renders five stars for a rating', () => {
    expect(render(q('rating')).match(/role="radio"/g)).toHaveLength(5)
  })

  it('marks a required question and disables inputs when read-only', () => {
    expect(render(q('text', { required: true }))).toContain('*')
    expect(render(q('text'), emptyForm(), true)).toContain('disabled')
  })

  it('renders a brand line with its brand list and the Other option', () => {
    const form = { ...emptyForm(), brands: [{ ...newBrandLine('q-brand_price'), isOther: true, brandOther: 'Other Co', price: '3.50' }] }
    const html = render(q('brand_price'), form)
    expect(html).toContain('Mama')
    expect(html).toContain('value="__other__" selected')
    expect(html).toContain('value="Other Co"')
    expect(html).toContain('value="3.50"')
  })

  it('shows the Khmer question text by default (Khmer is the app default), and the English text when there is none', () => {
    expect(render(q('yesno', { label: 'Sells it?', label_alt: 'លក់ឬទេ?' }))).toContain('លក់ឬទេ?')
    expect(render(q('yesno', { label: 'Sells it?' }))).toContain('Sells it?')
  })
})
