import type { StoredAnswer, StoredBrandPrice, SurveyFeedRow, SurveyQuestion } from './types'

/** One CSV field: quoted when it holds a comma, quote or line break; formula-looking text is defused for spreadsheets. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

export interface ExportInput {
  surveys: SurveyFeedRow[]
  /** Questions of every version involved, by id. */
  questions: SurveyQuestion[]
  answers: StoredAnswer[]
  brandPrices: StoredBrandPrice[]
  /** brands.id -> name. */
  brandNames: Record<string, string>
}

/**
 * One row per survey. Question columns are grouped by question text so
 * versions of a template line up; each brand + price line becomes one
 * "Brand (unit)" cell, e.g. "Mama (box) $4.20 | Other Co (piece) $3.50".
 */
export function exportRows(input: ExportInput): (string | number | null)[][] {
  const { surveys, questions, answers, brandPrices, brandNames } = input
  const byId = new Map(questions.map((q) => [q.id, q]))
  const columns = [...new Set([...questions].sort((a, b) => a.sort_order - b.sort_order).map((q) => q.label))]
  const answerBy = new Map<string, StoredAnswer[]>()
  for (const a of answers) answerBy.set(a.survey_id, [...(answerBy.get(a.survey_id) ?? []), a])
  const brandBy = new Map<string, StoredBrandPrice[]>()
  for (const b of brandPrices) brandBy.set(b.survey_id, [...(brandBy.get(b.survey_id) ?? []), b])

  const header = ['Surveyed at', 'Customer', 'Salesperson', 'Template', 'Target', 'Linked to visit', ...columns]
  const body = surveys.map((s) => {
    const cells = new Map<string, string>()
    for (const a of answerBy.get(s.id) ?? []) {
      const q = byId.get(a.question_id)
      if (!q) continue
      if (q.type === 'rating' || q.type === 'number') cells.set(q.label, a.value_number == null ? '' : String(a.value_number))
      else if (q.type === 'multi') cells.set(q.label, (a.value_json ?? []).map((k) => q.options.find((o) => o.key === k)?.label ?? k).join('; '))
      else if (q.type === 'single') cells.set(q.label, q.options.find((o) => o.key === a.value_text)?.label ?? a.value_text ?? '')
      else cells.set(q.label, a.value_text ?? '')
    }
    for (const q of questions.filter((x) => x.type === 'brand_price')) {
      const lines = (brandBy.get(s.id) ?? []).filter((b) => b.question_id === q.id)
      if (lines.length > 0) {
        cells.set(q.label, lines.map((b) => `${b.brand_id ? (brandNames[b.brand_id] ?? 'Brand') : b.brand_other} (${b.unit}) $${Number(b.price_usd).toFixed(2)}`).join(' | '))
      }
    }
    return [s.surveyed_at, s.customer_name, s.user_name, s.template_title, s.target_name, s.visit_id ? 'yes' : 'no', ...columns.map((c) => cells.get(c) ?? '')]
  })
  return [header, ...body]
}
