/**
 * Survey types (migration 0128). Declared by hand: the generated types don't
 * know the survey tables yet, and the view columns would all be nullable.
 */

export type QuestionType = 'single' | 'multi' | 'rating' | 'brand_price' | 'text' | 'number' | 'yesno' | 'photo'

export const QUESTION_TYPES: QuestionType[] = ['single', 'multi', 'rating', 'brand_price', 'text', 'number', 'yesno', 'photo']

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Single choice',
  multi: 'Multi choice',
  rating: 'Rating (1–5)',
  brand_price: 'Brand + price',
  text: 'Free text',
  number: 'Number',
  yesno: 'Yes / no',
  photo: 'Photo',
}

export type PriceUnit = 'piece' | 'box' | 'carton'
export const PRICE_UNITS: PriceUnit[] = ['piece', 'box', 'carton']

export type TargetKind = 'item' | 'category'

export interface SurveyOption {
  key: string
  label: string
  label_alt?: string | null
}

export interface SurveyQuestion {
  id: string
  version_id: string
  sort_order: number
  type: QuestionType
  label: string
  label_alt: string | null
  required: boolean
  options: SurveyOption[]
}

export interface SurveyTemplate {
  id: string
  title: string
  title_alt: string | null
  target_kind: TargetKind
  item_id: string | null
  category_id: string | null
  active: boolean
  current_version_id: string | null
  created_at: string
}

export interface TemplateVersion {
  id: string
  template_id: string
  version_no: number
  published_at: string | null
}

/** One row of survey_feed. */
export interface SurveyFeedRow {
  id: string
  template_id: string
  template_title: string
  template_title_alt: string | null
  target_kind: TargetKind
  target_name: string | null
  customer_id: string
  customer_name: string | null
  user_id: string
  user_name: string | null
  visit_id: string | null
  surveyed_at: string
  status: 'draft' | 'submitted'
  submitted_at: string | null
  remarks: string | null
  headline: string | null
  headline_alt: string | null
  headline_key: string | null
  brand_count: number
  editable: boolean
}

export interface BrandLine {
  /** Client-side key only. */
  uid: string
  questionId: string
  /** A brands.id, or null when brandOther is used. */
  brandId: string | null
  /** UI only: "Other brand…" is chosen, so the name is typed in brandOther. */
  isOther: boolean
  brandOther: string
  /** Typed text; parsed on save. */
  price: string
  unit: PriceUnit
}

/** What the form holds while it is being filled in. */
export interface FormState {
  /** question id -> option key (single), 'yes' | 'no', or text. */
  text: Record<string, string>
  /** question id -> number (rating / number). */
  number: Record<string, number | null>
  /** question id -> selected option keys (multi). */
  multi: Record<string, string[]>
  brands: BrandLine[]
  /** question id -> number of photos attached (photos live in survey_photos). */
  photos: Record<string, number>
  remarks: string
}

export interface AnswerPayload {
  question_id: string
  value_text?: string | null
  value_number?: number | null
  value_json?: string[] | null
}

export interface BrandPricePayload {
  question_id: string
  brand_id: string | null
  brand_other: string | null
  price_usd: number
  unit: PriceUnit
}

export interface StoredAnswer {
  survey_id: string
  question_id: string
  value_text: string | null
  value_number: number | null
  value_json: string[] | null
}

export interface StoredBrandPrice {
  id: string
  survey_id: string
  question_id: string
  brand_id: string | null
  brand_other: string | null
  price_usd: number
  unit: PriceUnit
}

export interface SurveyPhoto {
  id: string
  survey_id: string
  question_id: string | null
  photo_path: string
}

export interface SurveyRecord {
  id: string
  template_id: string
  version_id: string
  user_id: string
  customer_id: string
  visit_id: string | null
  surveyed_at: string
  status: 'draft' | 'submitted'
  submitted_at: string | null
  remarks: string | null
}

export interface QuestionDraft {
  /** Existing question id when editing a draft; only used as a React key. */
  uid: string
  type: QuestionType
  label: string
  label_alt: string
  required: boolean
  options: { uid: string; key: string; label: string; label_alt: string }[]
}

export interface ReportOption {
  key: string
  label: string
  n: number
}

export interface ReportQuestion {
  label: string
  type: QuestionType
  answered: number
  avg: number | null
  options: ReportOption[]
}

export interface ReportBrand {
  brand: string
  unit: PriceUnit
  n: number
  min: number
  avg: number
  max: number
}

export interface SurveyReport {
  total: number
  customers: number
  questions: ReportQuestion[]
  brands: ReportBrand[]
}
