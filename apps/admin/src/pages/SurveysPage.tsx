import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { surveysService } from '@footprints/shared/features/surveys/surveysService'
import type { SurveyTemplate } from '@footprints/shared/features/surveys/types'
import { SurveyReportPanel } from '@/features/surveys/SurveyReportPanel'

type Tab = 'templates' | 'report'

/** Surveys: the templates salespeople fill in, and the report on what they collected. */
export function SurveysPage() {
  const [search, setSearch] = useSearchParams()
  const tab: Tab = search.get('tab') === 'report' ? 'report' : 'templates'
  const [templates, setTemplates] = useState<SurveyTemplate[]>([])
  const [versionNo, setVersionNo] = useState<Record<string, { live: number | null; draft: boolean }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await surveysService.allTemplates()
      const info: Record<string, { live: number | null; draft: boolean }> = {}
      await Promise.all(
        all.map(async (t) => {
          const vs = await surveysService.versions(t.id)
          info[t.id] = { live: vs.find((v) => v.id === t.current_version_id)?.version_no ?? null, draft: vs.some((v) => v.published_at === null) }
        })
      )
      if (cancelled) return
      setTemplates(all)
      setVersionNo(info)
    })()
      .catch(() => !cancelled && setError('Could not load the templates.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setSearch(key === 'templates' ? {} : { tab: key })}
      aria-current={tab === key ? 'page' : undefined}
      className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-brand-500 text-white' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Surveys</h1>
          <p className="mt-1 text-sm text-neutral-500">Templates salespeople fill in at customers, and what they collected.</p>
        </div>
        {tab === 'templates' && (
          <Link to="/surveys/templates/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" aria-hidden /> New template
          </Link>
        )}
      </div>

      <div className="flex gap-1">
        {tabBtn('templates', 'Templates')}
        {tabBtn('report', 'Report')}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : tab === 'report' ? (
        <SurveyReportPanel templates={templates.filter((t) => versionNo[t.id]?.live !== null)} />
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">No templates yet. Create one to start collecting surveys.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {templates.map((t) => {
            const v = versionNo[t.id]
            return (
              <li key={t.id}>
                <Link to={`/surveys/templates/${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">{t.title}</p>
                    <p className="text-xs text-neutral-500">{t.target_kind === 'category' ? 'Category survey' : 'Product survey'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    {v?.live != null ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">Live v{v.live}</span> : <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700">Not published</span>}
                    {v?.draft && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">Draft changes</span>}
                    {!t.active && <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-neutral-700">Inactive</span>}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
