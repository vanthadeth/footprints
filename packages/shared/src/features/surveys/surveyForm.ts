import type {
  AnswerPayload,
  BrandLine,
  BrandPricePayload,
  FormState,
  PriceUnit,
  QuestionDraft,
  StoredAnswer,
  StoredBrandPrice,
  SurveyOption,
  SurveyQuestion,
} from './types'

/** The Khmer text when the app is in Khmer and there is one, else the English (base) text. */
export function localized(base: string, alt: string | null | undefined, language: 'en' | 'km'): string {
  return language === 'km' && alt && alt.trim() ? alt : base
}

export function optionLabel(o: SurveyOption, language: 'en' | 'km'): string {
  return localized(o.label, o.label_alt, language)
}

export function emptyForm(): FormState {
  return { text: {}, number: {}, multi: {}, brands: [], photos: {}, remarks: '' }
}

let uidSeq = 0
/** A short client-side key for list rows (brand lines, builder rows). */
export function newUid(): string {
  uidSeq += 1
  return `u${Date.now().toString(36)}${uidSeq}`
}

export function newBrandLine(questionId: string): BrandLine {
  return { uid: newUid(), questionId, brandId: null, isOther: false, brandOther: '', price: '', unit: 'piece' }
}

/** "4.20", "4,2" and "$4" all parse; empty, negative or non-numeric is null. */
export function parsePrice(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, '').replace(',', '.')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** A brand line is complete when it names a brand (listed or typed) and has a valid price. */
export function brandLineComplete(l: BrandLine): boolean {
  const named = l.brandId !== null || l.brandOther.trim() !== ''
  return named && parsePrice(l.price) !== null
}

/** A line with nothing filled in -- dropped on save rather than reported as incomplete. */
export function brandLineBlank(l: BrandLine): boolean {
  return l.brandId === null && l.brandOther.trim() === '' && l.price.trim() === ''
}

export function isAnswered(q: SurveyQuestion, f: FormState): boolean {
  switch (q.type) {
    case 'single':
    case 'yesno':
    case 'text':
      return (f.text[q.id] ?? '').trim() !== ''
    case 'rating':
    case 'number':
      return f.number[q.id] != null
    case 'multi':
      return (f.multi[q.id] ?? []).length > 0
    case 'brand_price':
      return f.brands.some((l) => l.questionId === q.id && brandLineComplete(l))
    case 'photo':
      return (f.photos[q.id] ?? 0) > 0
  }
}

/** Required questions still unanswered, in form order. Incomplete brand lines count as unanswered. */
export function missingRequired(questions: SurveyQuestion[], f: FormState): SurveyQuestion[] {
  return questions.filter((q) => q.required && !isAnswered(q, f))
}

export function progress(questions: SurveyQuestion[], f: FormState): { done: number; total: number } {
  return { done: questions.filter((q) => isAnswered(q, f)).length, total: questions.length }
}

/** True when a brand line was started but not finished (so Submit should say so, not silently drop it). */
export function hasIncompleteBrandLine(f: FormState): boolean {
  return f.brands.some((l) => !brandLineBlank(l) && !brandLineComplete(l))
}

export function buildAnswers(questions: SurveyQuestion[], f: FormState): AnswerPayload[] {
  const out: AnswerPayload[] = []
  for (const q of questions) {
    if (q.type === 'single' || q.type === 'yesno' || q.type === 'text') {
      const v = (f.text[q.id] ?? '').trim()
      if (v) out.push({ question_id: q.id, value_text: v })
    } else if (q.type === 'rating' || q.type === 'number') {
      const n = f.number[q.id]
      if (n != null) out.push({ question_id: q.id, value_number: n })
    } else if (q.type === 'multi') {
      const keys = f.multi[q.id] ?? []
      if (keys.length > 0) out.push({ question_id: q.id, value_json: keys })
    }
  }
  return out
}

export function buildBrandPrices(f: FormState): BrandPricePayload[] {
  return f.brands.filter(brandLineComplete).map((l) => ({
    question_id: l.questionId,
    brand_id: l.brandId,
    brand_other: l.brandId === null ? l.brandOther.trim() : null,
    price_usd: parsePrice(l.price) as number,
    unit: l.unit,
  }))
}

/** Rebuilds the form from a saved survey (continue a draft, or view / edit a submitted one). */
export function formFromStored(
  questions: SurveyQuestion[],
  answers: StoredAnswer[],
  brandPrices: StoredBrandPrice[],
  photoCounts: Record<string, number>,
  remarks: string | null
): FormState {
  const f = emptyForm()
  const byId = new Map(questions.map((q) => [q.id, q]))
  for (const a of answers) {
    const q = byId.get(a.question_id)
    if (!q) continue
    if (q.type === 'rating' || q.type === 'number') f.number[q.id] = a.value_number
    else if (q.type === 'multi') f.multi[q.id] = Array.isArray(a.value_json) ? a.value_json : []
    else if (a.value_text != null) f.text[q.id] = a.value_text
  }
  f.brands = brandPrices.map((p) => ({
    uid: newUid(),
    questionId: p.question_id,
    brandId: p.brand_id,
    isOther: p.brand_id === null,
    brandOther: p.brand_other ?? '',
    price: Number(p.price_usd).toFixed(2),
    unit: p.unit as PriceUnit,
  }))
  f.photos = { ...photoCounts }
  f.remarks = remarks ?? ''
  return f
}

export function toggleKey(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
}

// ----------------------------------------------------------------- template builder

/** An option key from its label: "Fast seller" -> "fast_seller"; made unique among `taken`. */
export function optionKey(label: string, taken: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'option'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

export function newQuestionDraft(type: QuestionDraft['type']): QuestionDraft {
  return {
    uid: newUid(),
    type,
    label: '',
    label_alt: '',
    required: false,
    options:
      type === 'single' || type === 'multi'
        ? [
            { uid: newUid(), key: '', label: '', label_alt: '' },
            { uid: newUid(), key: '', label: '', label_alt: '' },
          ]
        : [],
  }
}

/** Why a template can't be saved yet, or null. English: the builder is an admin screen. */
export function templateProblem(title: string, questions: QuestionDraft[]): string | null {
  if (title.trim() === '') return 'Give the template a title.'
  if (questions.length === 0) return 'Add at least one question.'
  for (const [i, q] of questions.entries()) {
    if (q.label.trim() === '') return `Question ${i + 1} needs a text.`
    if (q.type === 'single' || q.type === 'multi') {
      const filled = q.options.filter((o) => o.label.trim() !== '')
      if (filled.length < 2) return `Question ${i + 1} needs at least two options.`
    }
  }
  return null
}

/** The p_questions argument of save_survey_template: blank options dropped, keys made stable and unique. */
export function questionsPayload(questions: QuestionDraft[]) {
  return questions.map((q) => {
    const taken: string[] = []
    const options =
      q.type === 'single' || q.type === 'multi'
        ? q.options
            .filter((o) => o.label.trim() !== '')
            .map((o) => {
              const key = o.key && !taken.includes(o.key) ? o.key : optionKey(o.label, taken)
              taken.push(key)
              return { key, label: o.label.trim(), label_alt: o.label_alt.trim() || null }
            })
        : []
    return { type: q.type, label: q.label.trim(), label_alt: q.label_alt.trim() || null, required: q.required, options }
  })
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
