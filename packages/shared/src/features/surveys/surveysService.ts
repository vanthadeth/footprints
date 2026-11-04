import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { callRpc } from '../../lib/rpc'
import type {
  AnswerPayload,
  BrandPricePayload,
  StoredAnswer,
  StoredBrandPrice,
  SurveyFeedRow,
  SurveyPhoto,
  SurveyQuestion,
  SurveyRecord,
  SurveyReport,
  SurveyTemplate,
  TargetKind,
  TemplateVersion,
} from './types'

type Result = PromiseLike<{ data: unknown; error: PostgrestError | null }>
interface Query extends Result {
  eq(column: string, value: unknown): Query
  in(column: string, values: unknown[]): Query
  is(column: string, value: null): Query
  gte(column: string, value: unknown): Query
  lt(column: string, value: unknown): Query
  order(column: string, opts?: { ascending?: boolean }): Query
  limit(n: number): Query
  maybeSingle(): Query
}

/** Reads a survey table or view. Untyped on purpose: the generated types predate migration 0128 and mark view columns nullable. */
function from(name: string) {
  const f = supabase.from.bind(supabase) as unknown as (n: string) => { select(columns: string): Query }
  return f(name)
}

async function rows<T>(q: Query): Promise<T[]> {
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as T[]
}

export interface SaveSurveyInput {
  surveyId: string | null
  templateId: string
  customerId: string
  visitId: string | null
  answers: AnswerPayload[]
  brandPrices: BrandPricePayload[]
  remarks: string
  submit: boolean
}

export interface SaveTemplateInput {
  templateId: string | null
  title: string
  titleAlt: string
  targetKind: TargetKind
  itemId: string | null
  categoryId: string | null
  questions: unknown[]
  publish: boolean
}

export interface SurveyDetail {
  survey: SurveyRecord
  template: SurveyTemplate
  questions: SurveyQuestion[]
  answers: StoredAnswer[]
  brandPrices: StoredBrandPrice[]
  photos: SurveyPhoto[]
}

export interface ReportFilter {
  templateId: string
  from?: string | null
  to?: string | null
  userId?: string | null
}

/**
 * Surveys (0128): reads go through RLS-scoped tables and the survey_feed
 * view; every write is an RPC that re-checks survey permissions server-side.
 */
export const surveysService = {
  /** Templates the person can fill in: active, with a published version. Managers get every template from allTemplates(). */
  async publishedTemplates(): Promise<SurveyTemplate[]> {
    const all = await rows<SurveyTemplate>(from('survey_templates').select('*').eq('active', true).order('title'))
    return all.filter((t) => t.current_version_id !== null)
  },

  async allTemplates(): Promise<SurveyTemplate[]> {
    return rows<SurveyTemplate>(from('survey_templates').select('*').order('created_at', { ascending: false }))
  },

  async questionCounts(versionIds: string[]): Promise<Record<string, number>> {
    if (versionIds.length === 0) return {}
    const qs = await rows<{ version_id: string }>(from('survey_questions').select('version_id').in('version_id', versionIds))
    const out: Record<string, number> = {}
    for (const q of qs) out[q.version_id] = (out[q.version_id] ?? 0) + 1
    return out
  },

  async versions(templateId: string): Promise<TemplateVersion[]> {
    return rows<TemplateVersion>(from('survey_template_versions').select('*').eq('template_id', templateId).order('version_no', { ascending: false }))
  },

  async questions(versionId: string): Promise<SurveyQuestion[]> {
    return rows<SurveyQuestion>(from('survey_questions').select('*').eq('version_id', versionId).order('sort_order'))
  },

  async questionsForVersions(versionIds: string[]): Promise<SurveyQuestion[]> {
    if (versionIds.length === 0) return []
    return rows<SurveyQuestion>(from('survey_questions').select('*').in('version_id', versionIds).order('sort_order'))
  },

  async template(templateId: string): Promise<SurveyTemplate | null> {
    const r = await rows<SurveyTemplate>(from('survey_templates').select('*').eq('id', templateId).limit(1))
    return r[0] ?? null
  },

  async saveTemplate(input: SaveTemplateInput): Promise<string> {
    return callRpc<string>('save_survey_template', {
      p_template_id: input.templateId,
      p_title: input.title,
      p_title_alt: input.titleAlt,
      p_target_kind: input.targetKind,
      p_item_id: input.targetKind === 'item' ? input.itemId : null,
      p_category_id: input.targetKind === 'category' ? input.categoryId : null,
      p_questions: input.questions,
      p_publish: input.publish,
    })
  },

  async setTemplateActive(templateId: string, active: boolean): Promise<void> {
    await callRpc<void>('set_survey_template_active', { p_template_id: templateId, p_active: active })
  },

  async feed(opts: { limit?: number; userId?: string; from?: string; to?: string; templateId?: string } = {}): Promise<SurveyFeedRow[]> {
    let q = from('survey_feed').select('*')
    if (opts.userId) q = q.eq('user_id', opts.userId)
    if (opts.templateId) q = q.eq('template_id', opts.templateId)
    if (opts.from) q = q.gte('surveyed_at', opts.from)
    if (opts.to) q = q.lt('surveyed_at', opts.to)
    return rows<SurveyFeedRow>(q.order('surveyed_at', { ascending: false }).limit(opts.limit ?? 100))
  },

  async detail(surveyId: string): Promise<SurveyDetail | null> {
    const found = await rows<SurveyRecord>(from('surveys').select('*').eq('id', surveyId).limit(1))
    const survey = found[0]
    if (!survey) return null
    const [template, questions, answers, brandPrices, photos] = await Promise.all([
      this.template(survey.template_id),
      this.questions(survey.version_id),
      rows<StoredAnswer>(from('survey_answers').select('*').eq('survey_id', surveyId)),
      rows<StoredBrandPrice>(from('survey_brand_prices').select('*').eq('survey_id', surveyId)),
      rows<SurveyPhoto>(from('survey_photos').select('*').eq('survey_id', surveyId).order('created_at')),
    ])
    if (!template) return null
    return { survey, template, questions, answers, brandPrices, photos }
  },

  async save(input: SaveSurveyInput): Promise<SurveyRecord> {
    return callRpc<SurveyRecord>('save_survey', {
      p_survey_id: input.surveyId,
      p_template_id: input.templateId,
      p_customer_id: input.customerId,
      p_visit_id: input.visitId,
      p_answers: input.answers,
      p_brand_prices: input.brandPrices,
      p_remarks: input.remarks,
      p_submit: input.submit,
    })
  },

  async deleteDraft(surveyId: string): Promise<void> {
    await callRpc<void>('delete_survey_draft', { p_survey_id: surveyId })
  },

  async report(f: ReportFilter): Promise<SurveyReport> {
    return callRpc<SurveyReport>('survey_report', {
      p_template_id: f.templateId,
      p_from: f.from ?? null,
      p_to: f.to ?? null,
      p_user_id: f.userId ?? null,
    })
  },

  /** Raw rows behind the CSV export. */
  async exportData(surveyIds: string[]): Promise<{ answers: StoredAnswer[]; brandPrices: StoredBrandPrice[] }> {
    if (surveyIds.length === 0) return { answers: [], brandPrices: [] }
    const [answers, brandPrices] = await Promise.all([
      rows<StoredAnswer>(from('survey_answers').select('*').in('survey_id', surveyIds)),
      rows<StoredBrandPrice>(from('survey_brand_prices').select('*').in('survey_id', surveyIds)),
    ])
    return { answers, brandPrices }
  },

  /** Active brands for the brand + price picker. */
  async brands(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase.from('brands').select('id, name').eq('active', true).order('sort_order').order('name')
    if (error) throw error
    return data ?? []
  },

  async brandNames(): Promise<Record<string, string>> {
    const { data, error } = await supabase.from('brands').select('id, name')
    if (error) throw error
    return Object.fromEntries((data ?? []).map((b) => [b.id, b.name]))
  },

  /** Item categories / items for a template's target (admin builder). */
  async categories(): Promise<{ id: string; name: string; parent_id: string | null }[]> {
    const { data, error } = await supabase.from('item_categories').select('id, name, parent_id').eq('active', true).order('sort_order').order('name')
    if (error) throw error
    return data ?? []
  },

  async items(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase.from('items').select('id, name').eq('active', true).order('name').limit(2000)
    if (error) throw error
    return data ?? []
  },
}
