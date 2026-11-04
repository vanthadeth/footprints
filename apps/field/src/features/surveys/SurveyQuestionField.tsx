import { Check, Circle, CircleCheck, Star } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { localized, optionLabel, toggleKey } from '@footprints/shared/features/surveys/surveyForm'
import type { FormState, SurveyPhoto, SurveyQuestion } from '@footprints/shared/features/surveys/types'
import { BrandPriceField } from './BrandPriceField'
import { SurveyPhotoField } from './SurveyPhotoField'

const FIELD =
  'w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-50'

/** One question of a survey form, in the control its type calls for. Read-only when the survey can no longer be edited. */
export function SurveyQuestionField({
  question: q,
  form,
  setForm,
  brands,
  photos,
  readOnly,
  ensureSaved,
}: {
  question: SurveyQuestion
  form: FormState
  setForm: (update: (f: FormState) => FormState) => void
  brands: { id: string; name: string }[]
  photos: SurveyPhoto[]
  readOnly: boolean
  ensureSaved: () => Promise<string | null>
}) {
  const { t, language } = useLanguage()
  const title = localized(q.label, q.label_alt, language)
  const setText = (v: string) => setForm((f) => ({ ...f, text: { ...f.text, [q.id]: v } }))
  const setNumber = (v: number | null) => setForm((f) => ({ ...f, number: { ...f.number, [q.id]: v } }))

  let control
  switch (q.type) {
    case 'single':
    case 'yesno': {
      const options = q.type === 'yesno' ? [{ key: 'yes', label: t('survey.yes') }, { key: 'no', label: t('survey.no') }] : q.options.map((o) => ({ key: o.key, label: optionLabel(o, language) }))
      const value = form.text[q.id] ?? ''
      control = (
        <div role="radiogroup" aria-label={title} className="flex flex-col gap-2">
          {options.map((o) => {
            const on = value === o.key
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={readOnly}
                onClick={() => setText(on ? '' : o.key)}
                className={`flex min-h-12 items-center gap-2.5 rounded-xl border-2 px-3.5 text-left text-[14px] tap-target ${
                  on ? 'border-brand-500 bg-brand-50 font-semibold text-brand-600' : 'border-neutral-200 bg-white font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100'
                }`}
              >
                {on ? <CircleCheck className="h-5 w-5 shrink-0" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />}
                {o.label}
              </button>
            )
          })}
        </div>
      )
      break
    }
    case 'multi': {
      const keys = form.multi[q.id] ?? []
      control = (
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {q.options.map((o) => {
            const on = keys.includes(o.key)
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={on}
                disabled={readOnly}
                onClick={() => setForm((f) => ({ ...f, multi: { ...f.multi, [q.id]: toggleKey(f.multi[q.id] ?? [], o.key) } }))}
                className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-[14px] tap-target ${
                  on ? 'border-brand-500 bg-brand-50 font-semibold text-brand-600' : 'border-neutral-200 bg-white font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100'
                }`}
              >
                {on && <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
                {optionLabel(o, language)}
              </button>
            )
          })}
        </div>
      )
      break
    }
    case 'rating': {
      const value = form.number[q.id] ?? 0
      control = (
        <div>
          <div role="radiogroup" aria-label={title} className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={value === n}
                aria-label={`${n} / 5`}
                disabled={readOnly}
                onClick={() => setNumber(value === n ? null : n)}
                className="flex h-12 w-12 items-center justify-center tap-target"
              >
                <Star className={`h-9 w-9 ${n <= value ? 'fill-amber-400 text-amber-600' : 'fill-transparent text-neutral-400'}`} strokeWidth={1.6} aria-hidden />
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-neutral-500">
            <span>{t('survey.ratingLow')}</span>
            <span>{t('survey.ratingHigh')}</span>
          </div>
        </div>
      )
      break
    }
    case 'text':
      control = (
        <textarea
          aria-label={title}
          rows={3}
          maxLength={4000}
          disabled={readOnly}
          placeholder={t('survey.textPlaceholder')}
          value={form.text[q.id] ?? ''}
          onChange={(e) => setText(e.target.value)}
          className={FIELD}
        />
      )
      break
    case 'number':
      control = (
        <input
          type="number"
          inputMode="decimal"
          aria-label={title}
          disabled={readOnly}
          placeholder={t('survey.numberPlaceholder')}
          value={form.number[q.id] ?? ''}
          onChange={(e) => setNumber(e.target.value === '' || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value))}
          className={FIELD}
        />
      )
      break
    case 'brand_price':
      control = (
        <BrandPriceField
          questionId={q.id}
          lines={form.brands}
          brands={brands}
          readOnly={readOnly}
          onChange={(brandLines) => setForm((f) => ({ ...f, brands: brandLines }))}
        />
      )
      break
    case 'photo':
      control = (
        <SurveyPhotoField
          questionId={q.id}
          initial={photos.filter((p) => p.question_id === q.id)}
          editable={!readOnly}
          ensureSaved={ensureSaved}
          onCount={(n) => setForm((f) => ({ ...f, photos: { ...f.photos, [q.id]: n } }))}
        />
      )
      break
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">
        {title}
        {q.required && (
          <span className="text-status-danger" aria-label={t('survey.required')}>
            {' '}
            *
          </span>
        )}
      </h2>
      {q.type === 'multi' && <p className="mt-0.5 text-xs text-neutral-500">{t('survey.chooseAll')}</p>}
      <div className="mt-3">{control}</div>
    </section>
  )
}
