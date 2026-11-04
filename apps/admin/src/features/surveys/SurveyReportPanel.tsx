import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '@footprints/shared/lib/supabase'
import { surveysService } from '@footprints/shared/features/surveys/surveysService'
import { exportRows, toCsv } from '@footprints/shared/features/surveys/reportCsv'
import type { SurveyReport, SurveyTemplate } from '@footprints/shared/features/surveys/types'
import { Field, Select, TextInput } from '@/components/form'

const TZ_OFFSET = '+07:00' // Asia/Phnom_Penh, no DST

/** A calendar day (YYYY-MM-DD) as the instant it starts in Phnom Penh; `plusDays` 1 gives the exclusive end of that day. */
function dayStart(day: string, plusDays = 0): string | null {
  if (!day) return null
  const d = new Date(`${day}T00:00:00${TZ_OFFSET}`)
  d.setUTCDate(d.getUTCDate() + plusDays)
  return d.toISOString()
}

const money = (n: number) => `$${Number(n).toFixed(2)}`

/**
 * The survey report: pick a template (all its versions are combined by
 * question text), narrow by date and salesperson, and see outcome / likes /
 * dislikes as counts, rating averages and the brand price comparison.
 * The numbers come from survey_report (RLS-scoped); Export CSV is one row
 * per survey with the same filters.
 */
export function SurveyReportPanel({ templates }: { templates: SurveyTemplate[] }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [userId, setUserId] = useState('')
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])
  const [report, setReport] = useState<SurveyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('users')
      .select('id, full_name')
      .eq('status', 'active')
      .order('full_name')
      .then(({ data }) => setPeople((data ?? []).filter((p): p is { id: string; full_name: string } => !!p.full_name)))
  }, [])

  const filter = useMemo(() => ({ templateId, from: dayStart(from), to: dayStart(to, 1), userId: userId || null }), [templateId, from, to, userId])

  useEffect(() => {
    if (!templateId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    surveysService
      .report(filter)
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setError('Could not load the report.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filter, templateId])

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      const feed = (await surveysService.feed({ limit: 5000, templateId, from: filter.from ?? undefined, to: filter.to ?? undefined, userId: filter.userId ?? undefined })).filter((s) => s.status === 'submitted')
      const [data, versions, brandNames] = await Promise.all([surveysService.exportData(feed.map((s) => s.id)), surveysService.versions(templateId), surveysService.brandNames()])
      const questions = await surveysService.questionsForVersions(versions.filter((v) => v.published_at).map((v) => v.id))
      const csv = toCsv(exportRows({ surveys: feed, questions, answers: data.answers, brandPrices: data.brandPrices, brandNames }))
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `surveys-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not export the surveys.')
    } finally {
      setExporting(false)
    }
  }

  if (templates.length === 0) return <p className="text-sm text-neutral-500">Create and publish a template first; its report appears here.</p>

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Template">
          <Select value={templateId} onChange={setTemplateId}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <TextInput type="date" value={from} onChange={setFrom} />
        </Field>
        <Field label="To">
          <TextInput type="date" value={to} onChange={setTo} />
        </Field>
        <Field label="Salesperson">
          <Select value={userId} onChange={setUserId} placeholder="Everyone">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => void exportCsv()} disabled={exporting || !templateId} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
      {loading && !report && <p className="text-sm text-neutral-500">Loading…</p>}

      {report && (
        <div className={loading ? 'space-y-6 opacity-60' : 'space-y-6'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Tile label="Surveys submitted" value={String(report.total)} />
            <Tile label="Customers surveyed" value={String(report.customers)} />
          </div>

          {report.total === 0 ? (
            <p className="text-sm text-neutral-500">No submitted surveys match these filters.</p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {report.questions.map((q) => (
                  <section key={`${q.type}:${q.label}`} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                    <div>
                      <h3 className="text-[15px] font-bold text-neutral-900 dark:text-neutral-50">{q.label}</h3>
                      <p className="text-xs text-neutral-500">
                        {q.answered} of {report.total} answered
                      </p>
                    </div>
                    {q.type === 'rating' || q.type === 'number' ? (
                      <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
                        {q.avg ?? '–'}
                        {q.type === 'rating' && <span className="text-base font-semibold text-neutral-500"> / 5 average</span>}
                        {q.type === 'number' && <span className="text-base font-semibold text-neutral-500"> average</span>}
                      </p>
                    ) : q.options.length > 0 ? (
                      <ul className="space-y-2.5">
                        {q.options.map((o) => (
                          <li key={o.key}>
                            <div className="mb-1 flex justify-between text-[13px] text-neutral-700 dark:text-neutral-200">
                              <span>{o.label}</span>
                              <span className="font-semibold tabular-nums">
                                {o.n} · {Math.round((o.n / Math.max(q.answered, 1)) * 100)}%
                              </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
                              <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${Math.round((o.n / Math.max(q.answered, 1)) * 100)}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>

              {report.brands.length > 0 && (
                <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                  <h3 className="text-[15px] font-bold text-neutral-900 dark:text-neutral-50">Brand price comparison</h3>
                  <p className="mb-3 text-xs text-neutral-500">Purchase price by brand and unit.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500 dark:border-neutral-700">
                          <th className="py-2 pr-3">Brand</th>
                          <th className="py-2 pr-3">Unit</th>
                          <th className="py-2 pr-3 text-right">Lines</th>
                          <th className="py-2 pr-3 text-right">Min</th>
                          <th className="py-2 pr-3 text-right">Average</th>
                          <th className="py-2 text-right">Max</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {report.brands.map((b) => (
                          <tr key={`${b.brand}:${b.unit}`} className="border-b border-neutral-100 dark:border-neutral-800">
                            <td className="py-2.5 pr-3 font-semibold text-neutral-900 dark:text-neutral-50">{b.brand}</td>
                            <td className="py-2.5 pr-3 capitalize">{b.unit}</td>
                            <td className="py-2.5 pr-3 text-right">{b.n}</td>
                            <td className="py-2.5 pr-3 text-right">{money(b.min)}</td>
                            <td className="py-2.5 pr-3 text-right">{money(b.avg)}</td>
                            <td className="py-2.5 text-right">{money(b.max)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[13px] font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-neutral-900 dark:text-neutral-50">{value}</p>
    </div>
  )
}
