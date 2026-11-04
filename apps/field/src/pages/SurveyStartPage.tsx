import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Circle, CircleCheck, Search } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { formatTime } from '@footprints/shared/lib/datetime'
import { surveysService } from '@footprints/shared/features/surveys/surveysService'
import { localized } from '@footprints/shared/features/surveys/surveyForm'
import type { SurveyTemplate } from '@footprints/shared/features/surveys/types'
import { EmptyState } from '@/components/EmptyState'
import { Switch } from '@/components/Switch'
import { useCustomers } from '@/features/customers/useCustomers'
import { findOpenVisit } from '@/features/surveys/openVisit'

const STEP = 'text-[13px] font-semibold uppercase tracking-wide text-neutral-500'

/**
 * Starts a survey: pick the customer (prefilled from a customer page), pick a
 * published template, and -- when checked in at that customer -- choose
 * whether to attach it to the visit. Nothing is saved until the form is.
 */
export function SurveyStartPage() {
  const { t, language } = useLanguage()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const meId = session?.user.id ?? null
  const { customers } = useCustomers()

  const [customerId, setCustomerId] = useState<string | null>(search.get('customer'))
  const [query, setQuery] = useState('')
  const [templates, setTemplates] = useState<SurveyTemplate[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [visit, setVisit] = useState<{ id: string; checked_in_at: string } | null>(null)
  const [attach, setAttach] = useState(true)

  useEffect(() => {
    let cancelled = false
    surveysService
      .publishedTemplates()
      .then(async (tpls) => {
        const c = await surveysService.questionCounts(tpls.map((x) => x.current_version_id as string))
        if (cancelled) return
        setTemplates(tpls)
        setCounts(c)
        if (tpls.length === 1) setTemplateId(tpls[0].id)
      })
      .catch(() => {
        // An empty list is shown; the person can retry by reopening the page.
      })
      .finally(() => !cancelled && setLoadingTemplates(false))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setVisit(null)
    if (!meId || !customerId) return
    let cancelled = false
    findOpenVisit(meId, customerId)
      .then((v) => !cancelled && setVisit(v))
      .catch(() => {
        // No visit link is offered; the survey is simply standalone.
      })
    return () => {
      cancelled = true
    }
  }, [meId, customerId])

  const customer = customers.find((c) => c.id === customerId) ?? null
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter((c) => c.id && c.shop_name && (q === '' || c.shop_name.toLowerCase().includes(q))).slice(0, 8)
  }, [customers, query])

  function start() {
    if (!customerId || !templateId) return
    const params = new URLSearchParams({ template: templateId, customer: customerId })
    if (visit && attach) params.set('visit', visit.id)
    navigate(`/surveys/new?${params.toString()}`)
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pb-8 pt-1 md:max-w-2xl md:px-8 md:pt-4">
      <section>
        <h2 className={`mb-2 ${STEP}`}>{t('survey.stepCustomer')}</h2>
        {customerId && customer ? (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-500 bg-white p-3.5 dark:bg-neutral-900">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">{customer.shop_name}</p>
              <p className="truncate text-[13px] text-neutral-500">{[customer.commune_name, customer.district_name, customer.province_name].filter(Boolean).join(', ')}</p>
            </div>
            <button type="button" onClick={() => setCustomerId(null)} className="h-9 shrink-0 rounded-xl border border-neutral-300 px-3 text-[13px] font-semibold text-neutral-800 tap-target dark:border-neutral-600 dark:text-neutral-100">
              {t('survey.change')}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('survey.searchCustomer')}
                aria-label={t('survey.searchCustomer')}
                className="h-12 w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-3 text-[15px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-50"
              />
            </label>
            {matches.length === 0 ? (
              <p className="px-1 pb-1 pt-3 text-sm text-neutral-500">{t('survey.noCustomers')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCustomerId(c.id)} className="block w-full px-1 py-3 text-left tap-target">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">{c.shop_name}</span>
                      <span className="block truncate text-[13px] text-neutral-500">{[c.commune_name, c.province_name].filter(Boolean).join(', ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className={`mb-2 ${STEP}`}>{t('survey.stepTemplate')}</h2>
        {loadingTemplates ? (
          <div className="h-20 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
        ) : templates.length === 0 ? (
          <EmptyState icon={Search} title={t('survey.noTemplates')} />
        ) : (
          <div role="radiogroup" aria-label={t('survey.stepTemplate')} className="space-y-2">
            {templates.map((tpl) => {
              const on = tpl.id === templateId
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTemplateId(tpl.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left tap-target ${
                    on ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] font-semibold ${on ? 'text-brand-600' : 'text-neutral-900 dark:text-neutral-50'}`}>{localized(tpl.title, tpl.title_alt, language)}</span>
                    <span className="block text-[13px] text-neutral-600 dark:text-neutral-400">
                      {tpl.target_kind === 'category' ? t('survey.targetCategory') : t('survey.targetProduct')} · {t('survey.questionsCount', { n: counts[tpl.current_version_id as string] ?? 0 })}
                    </span>
                  </span>
                  {on ? <CircleCheck className="h-6 w-6 shrink-0 text-brand-500" aria-hidden /> : <Circle className="h-6 w-6 shrink-0 text-neutral-400" aria-hidden />}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {customerId && (
        <section>
          <h2 className={`mb-2 ${STEP}`}>{t('survey.stepVisit')}</h2>
          {visit ? (
            <>
              <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">{t('survey.visitLink')}</p>
                  <p className="text-[13px] text-neutral-500">{t('survey.visitLinkSub', { time: formatTime(visit.checked_in_at) })}</p>
                </div>
                <Switch checked={attach} onChange={setAttach} label={t('survey.visitLink')} />
              </div>
              <p className="mt-2 px-1 text-xs text-neutral-500">{t('survey.visitOffHint')}</p>
            </>
          ) : (
            <p className="rounded-2xl border border-neutral-200 bg-white p-3.5 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">{t('survey.visitNone')}</p>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={start}
        disabled={!customerId || !templateId}
        className="h-13 w-full rounded-2xl bg-brand-500 py-3.5 text-base font-semibold text-white tap-target disabled:opacity-50"
      >
        {t('survey.start')}
      </button>
    </div>
  )
}
