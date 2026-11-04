import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, ClipboardList, MapPin, Plus } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { usePermissions } from '@footprints/shared/features/permissions/PermissionsContext'
import { surveysService } from '@footprints/shared/features/surveys/surveysService'
import { localized } from '@footprints/shared/features/surveys/surveyForm'
import type { SurveyFeedRow } from '@footprints/shared/features/surveys/types'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { EmptyState } from '@/components/EmptyState'

type Filter = 'all' | 'drafts' | 'week'
type Tab = 'mine' | 'team'

const WEEK_MS = 7 * 24 * 3600_000

/** My surveys (and, with survey view at Team / All scope, my team's), newest first. */
export function SurveysPage() {
  const { t, language } = useLanguage()
  const { session } = useAuth()
  const { scope, can } = usePermissions()
  const navigate = useNavigate()
  const meId = session?.user.id ?? null
  const seesTeam = scope('survey', 'view') === 'sub' || scope('survey', 'view') === 'any'
  const canAdd = can('survey', 'add')

  const [rows, setRows] = useState<SurveyFeedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('mine')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    surveysService
      .feed({ limit: 200 })
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError(t('survey.loadFailed')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // The page loads once; the language only changes the error text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => {
    const now = Date.now()
    return rows
      .filter((r) => (tab === 'mine' ? r.user_id === meId : r.user_id !== meId))
      .filter((r) => (filter === 'drafts' ? r.status === 'draft' : filter === 'week' ? now - new Date(r.surveyed_at).getTime() < WEEK_MS : true))
  }, [rows, tab, filter, meId])
  const draftCount = rows.filter((r) => r.user_id === meId && r.status === 'draft').length

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('survey.filterAll') },
    { key: 'week', label: t('survey.filterWeek') },
    { key: 'drafts', label: draftCount > 0 && tab === 'mine' ? `${t('survey.filterDrafts')} · ${draftCount}` : t('survey.filterDrafts') },
  ]

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-6 pt-1 md:max-w-2xl md:px-8 md:pt-4">
      {seesTeam && (
        <SegmentedControl
          ariaLabel={t('nav.surveys')}
          shape="tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: t('survey.tabMine') },
            { value: 'team', label: t('survey.tabTeam') },
          ]}
        />
      )}

      <div role="radiogroup" aria-label={t('survey.filterAll')} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
        {filters.map((f) => {
          const on = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f.key)}
              className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold tap-target ${
                on ? 'border-brand-500 bg-brand-50 text-brand-500' : 'border-neutral-200 bg-white text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('survey.emptyTitle')} body={canAdd ? t('survey.emptyBody') : undefined} />
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => {
            const draft = r.status === 'draft'
            const title = localized(r.template_title, r.template_title_alt, language)
            const headline = localized(r.headline ?? '', r.headline_alt, language)
            return (
              <li key={r.id}>
                <Link
                  to={`/surveys/${r.id}`}
                  className={`block rounded-2xl border bg-white p-3.5 tap-target dark:bg-neutral-900 ${draft ? 'border-dashed border-neutral-400 dark:border-neutral-600' : 'border-neutral-200 dark:border-neutral-800'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">{r.customer_name ?? '—'}</p>
                      <p className="truncate text-[13px] text-neutral-500">
                        {title}
                        {r.target_name ? ` · ${r.target_name}` : ''}
                      </p>
                    </div>
                    {draft ? (
                      <span className="shrink-0 rounded-full border border-brand-500 px-2.5 py-1 text-xs font-bold text-brand-600">{t('survey.continue')}</span>
                    ) : (
                      headline && <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-600">{headline}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      {new Date(r.surveyed_at).toLocaleString(language === 'km' ? 'km-KH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    {draft && <span>{t('survey.draft')}</span>}
                    {!draft && (
                      <span className="flex items-center gap-1">
                        {r.visit_id && <MapPin className="h-3.5 w-3.5" aria-hidden />}
                        {r.visit_id ? t('survey.linkedVisit') : t('survey.standalone')}
                      </span>
                    )}
                    {r.brand_count > 0 && <span>{t('survey.brandsCompared', { n: r.brand_count })}</span>}
                    {tab === 'team' && r.user_name && <span>{t('survey.by', { name: r.user_name })}</span>}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {canAdd && (
        <button
          type="button"
          onClick={() => navigate('/surveys/start')}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-base font-semibold text-white tap-target"
        >
          <Plus className="h-5 w-5" aria-hidden />
          {t('survey.newSurvey')}
        </button>
      )}
    </div>
  )
}
