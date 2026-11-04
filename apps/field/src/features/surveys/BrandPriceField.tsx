import { Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { newBrandLine } from '@footprints/shared/features/surveys/surveyForm'
import type { BrandLine, PriceUnit } from '@footprints/shared/features/surveys/types'

const OTHER = '__other__'
const FIELD =
  'h-12 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-[15px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-50'

/**
 * The repeatable "brand + purchase price" lines of a brand_price question:
 * a brand from the brands list or "Other" with the name typed, a price in
 * USD and a unit (piece / box / carton).
 */
export function BrandPriceField({
  questionId,
  lines,
  brands,
  readOnly,
  onChange,
}: {
  questionId: string
  /** Every brand line of the form; this field edits only its own question's. */
  lines: BrandLine[]
  brands: { id: string; name: string }[]
  readOnly: boolean
  onChange: (lines: BrandLine[]) => void
}) {
  const { t } = useLanguage()
  const mine = lines.filter((l) => l.questionId === questionId)
  const patch = (uid: string, change: Partial<BrandLine>) => onChange(lines.map((l) => (l.uid === uid ? { ...l, ...change } : l)))
  const unitOptions: { value: PriceUnit; label: string }[] = [
    { value: 'piece', label: t('survey.unitPiece') },
    { value: 'box', label: t('survey.unitBox') },
    { value: 'carton', label: t('survey.unitCarton') },
  ]

  return (
    <div className="space-y-3">
      {mine.map((l, i) => {
        const other = l.brandId === null && l.isOther
        return (
          <div key={l.uid} className="space-y-2.5 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">{t('survey.brandLine', { n: i + 1 })}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onChange(lines.filter((x) => x.uid !== l.uid))}
                  aria-label={t('survey.removeBrand')}
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 tap-target"
                >
                  <Trash2 className="h-[18px] w-[18px]" aria-hidden />
                </button>
              )}
            </div>
            <select
              aria-label={t('survey.brand')}
              disabled={readOnly}
              value={l.brandId ?? (l.isOther ? OTHER : '')}
              onChange={(e) => {
                const v = e.target.value
                if (v === OTHER) patch(l.uid, { brandId: null, isOther: true })
                else if (v === '') patch(l.uid, { brandId: null, isOther: false, brandOther: '' })
                else patch(l.uid, { brandId: v, isOther: false, brandOther: '' })
              }}
              className={FIELD}
            >
              <option value="">{t('survey.brand')}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value={OTHER}>{t('survey.otherBrand')}</option>
            </select>
            {other && (
              <input
                type="text"
                aria-label={t('survey.typeBrand')}
                placeholder={t('survey.typeBrand')}
                disabled={readOnly}
                maxLength={120}
                value={l.brandOther}
                onChange={(e) => patch(l.uid, { brandOther: e.target.value })}
                className={FIELD}
              />
            )}
            <div className="flex items-center gap-2.5">
              <label className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={t('survey.price')}
                  placeholder="0.00"
                  disabled={readOnly}
                  value={l.price}
                  onChange={(e) => patch(l.uid, { price: e.target.value.replace(/[^0-9.,]/g, '') })}
                  className={`${FIELD} pl-7`}
                />
              </label>
              <SegmentedControl shape="tabs" ariaLabel={t('survey.price')} options={unitOptions} value={l.unit} onChange={(unit) => !readOnly && patch(l.uid, { unit })} />
            </div>
          </div>
        )
      })}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange([...lines, newBrandLine(questionId)])}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-500 text-sm font-semibold text-brand-600 tap-target"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden />
          {t('survey.addBrand')}
        </button>
      )}
    </div>
  )
}
