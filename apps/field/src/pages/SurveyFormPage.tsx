import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClipboardList, Loader2, Trash2 } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { usePermissions } from '@footprints/shared/features/permissions/PermissionsContext'
import { surveysService, type SurveyDetail } from '@footprints/shared/features/surveys/surveysService'
import {
  buildAnswers,
  buildBrandPrices,
  emptyForm,
  formFromStored,
  hasIncompleteBrandLine,
  localized,
  missingRequired,
  progress,
} from '@footprints/shared/features/surveys/surveyForm'
import type { FormState, SurveyPhoto, SurveyQuestion, SurveyRecord, SurveyTemplate } from '@footprints/shared/features/surveys/types'
import { EmptyState } from '@/components/EmptyState'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { SurveyQuestionField } from '@/features/surveys/SurveyQuestionField'

const DAY_MS = 24 * 3600_000

/** Can the person still change this survey? The server decides for real; this just hides controls that would be refused. */
function canEdit(record: SurveyRecord | null, meId: string | null, canCorrectOthers: boolean): boolean {
  if (!record) return true
  if (record.user_id === meId) return record.status === 'draft' || (!!record.submitted_at && Date.now() - new Date(record.submitted_at).getTime() < DAY_MS)
  return canCorrectOthers
}

/**
 * One survey: a new one (/surveys/new?template=…&customer=…&visit=…), a
 * draft to continue, or a submitted one to view or -- within 24 hours --
 * edit. The questions come from the template version the survey was
 * started on, so an old survey keeps its old questions after the template
 * changes.
 */
export function SurveyFormPage() {
  const { id = 'new' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { t, language } = useLanguage()
  const { session } = useAuth()
  const { scope } = usePermissions()
  const online = useNetworkStatus()
  const meId = session?.user.id ?? null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<SurveyTemplate | null>(null)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [record, setRecord] = useState<SurveyRecord | null>(null)
  const [photos, setPhotos] = useState<SurveyPhoto[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [form, setFormState] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState<'draft' | 'submit' | 'delete' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const customerId = record?.customer_id ?? search.get('customer')
  const visitId = record ? record.visit_id : search.get('visit')
  const names = useCustomerNames([customerId])
  /** Id of a draft this page just created: the route change to it must not reload what is already on screen. */
  const createdId = useRef<string | null>(null)
  const formRef = useRef(form)
  formRef.current = form
  const recordRef = useRef(record)
  recordRef.current = record

  const setForm = useCallback((update: (f: FormState) => FormState) => setFormState((f) => update(f)), [])

  useEffect(() => {
    if (createdId.current === id) {
      createdId.current = null
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setRecord(null)
    setMessage(null)
    const load = async () => {
      const [brandList] = await Promise.all([surveysService.brands().catch(() => [])])
      if (cancelled) return
      setBrands(brandList)
      if (id === 'new') {
        const tid = search.get('template')
        const tpl = tid ? await surveysService.template(tid) : null
        if (!tpl?.current_version_id) throw new Error(t('survey.notFound'))
        const qs = await surveysService.questions(tpl.current_version_id)
        if (cancelled) return
        setTemplate(tpl)
        setQuestions(qs)
        setPhotos([])
        setFormState(emptyForm())
      } else {
        const d: SurveyDetail | null = await surveysService.detail(id)
        if (!d) throw new Error(t('survey.notFound'))
        if (cancelled) return
        setTemplate(d.template)
        setQuestions(d.questions)
        setRecord(d.survey)
        setPhotos(d.photos)
        const counts: Record<string, number> = {}
        for (const p of d.photos) if (p.question_id) counts[p.question_id] = (counts[p.question_id] ?? 0) + 1
        setFormState(formFromStored(d.questions, d.answers, d.brandPrices, counts, d.survey.remarks))
      }
    }
    load()
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('survey.notFound')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // search is read only for a brand-new survey, whose URL doesn't change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /** Saves the form (as a draft, or submitted) and returns the saved survey, or null with the problem shown. */
  const persist = useCallback(
    async (submit: boolean): Promise<SurveyRecord | null> => {
      if (!template || !customerId) return null
      if (!online) {
        setError(t('survey.offline'))
        return null
      }
      const f = formRef.current
      if (submit) {
        const missing = missingRequired(questions, f)
        const incomplete = hasIncompleteBrandLine(f) ? questions.find((q) => q.type === 'brand_price') : undefined
        const first = missing[0] ?? incomplete
        if (first) {
          setError(t('survey.missing', { q: localized(first.label, first.label_alt, language) }))
          return null
        }
      }
      setError(null)
      setMessage(null)
      try {
        return await surveysService.save({
          surveyId: recordRef.current?.id ?? null,
          templateId: template.id,
          customerId,
          visitId: visitId ?? null,
          answers: buildAnswers(questions, f),
          brandPrices: buildBrandPrices(f),
          remarks: f.remarks,
          submit,
        })
      } catch (e) {
        const detail = (e as { details?: string; message?: string })?.details
        setError(detail?.startsWith('Answer: ') ? t('survey.missing', { q: detail.slice(8) }) : t('survey.saveFailed'))
        return null
      }
    },
    [template, customerId, visitId, questions, online, language, t]
  )

  /** Called by a photo question: saves a draft first when the survey doesn't exist yet. */
  const ensureSaved = useCallback(async (): Promise<string | null> => {
    if (recordRef.current) return recordRef.current.id
    setMessage(t('survey.photoSaveFirst'))
    const saved = await persist(false)
    if (!saved) return null
    recordRef.current = saved
    setRecord(saved)
    createdId.current = saved.id
    navigate(`/surveys/${saved.id}`, { replace: true })
    setMessage(null)
    return saved.id
  }, [persist, navigate, t])

  async function saveDraft() {
    setBusy('draft')
    const saved = await persist(false)
    setBusy(null)
    if (!saved) return
    setRecord(saved)
    setMessage(t('survey.saved'))
    if (id === 'new') {
      createdId.current = saved.id
      navigate(`/surveys/${saved.id}`, { replace: true })
    }
  }

  async function submit() {
    setBusy('submit')
    const saved = await persist(true)
    setBusy(null)
    if (saved) navigate('/surveys', { replace: true })
  }

  async function deleteDraft() {
    if (!record || !window.confirm(t('survey.deleteConfirm'))) return
    setBusy('delete')
    try {
      await surveysService.deleteDraft(record.id)
      navigate('/surveys', { replace: true })
    } catch {
      setError(t('survey.saveFailed'))
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-2 md:max-w-2xl">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
        ))}
      </div>
    )
  }
  if (!template || (error && questions.length === 0)) {
    return <EmptyState icon={ClipboardList} title={error ?? t('survey.notFound')} />
  }

  const editable = canEdit(record, meId, scope('survey', 'edit') !== null)
  const { done, total } = progress(questions, form)
  const customerName = (customerId && names[customerId]) || ''
  const submittedAlready = record?.status === 'submitted'

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-1 md:max-w-2xl md:px-8 md:pt-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-[15px] font-bold text-neutral-900 dark:text-neutral-50">{localized(template.title, template.title_alt, language)}</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {customerName}
          {customerName && ' · '}
          {new Date(record?.surveyed_at ?? Date.now()).toLocaleString(language === 'km' ? 'km-KH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-neutral-500">{t('survey.progress', { done, total })}</span>
        </div>
        {visitId && <p className="mt-2 text-xs font-medium text-brand-600">{t('survey.visitAttached')}</p>}
      </div>

      {!editable && <p className="rounded-xl bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{t('survey.locked')}</p>}

      {questions.map((q) => (
        <SurveyQuestionField key={q.id} question={q} form={form} setForm={setForm} brands={brands} photos={photos} readOnly={!editable} ensureSaved={ensureSaved} />
      ))}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="block text-[15px] font-semibold text-neutral-900 dark:text-neutral-50" htmlFor="survey-remarks">
          {t('survey.remarks')}
        </label>
        <textarea
          id="survey-remarks"
          rows={3}
          maxLength={4000}
          disabled={!editable}
          value={form.remarks}
          onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
          className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-status-danger/10 px-3.5 py-2.5 text-sm font-medium text-status-danger">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-600">
          {message}
        </p>
      )}
      {editable && <p className="px-1 text-xs text-neutral-500">{t('survey.editWindow')}</p>}

      {editable && (
        <div className="flex gap-2.5 pt-1">
          {!submittedAlready && (
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={busy !== null}
              className="h-13 w-32 shrink-0 rounded-2xl border border-neutral-300 bg-white py-3.5 text-[15px] font-semibold text-neutral-800 tap-target disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {busy === 'draft' ? t('survey.saving') : t('survey.saveDraft')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy !== null}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-base font-semibold text-white tap-target disabled:opacity-60"
          >
            {busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy === 'submit' ? t('survey.saving') : t('survey.submit')}
          </button>
        </div>
      )}
      {editable && record?.status === 'draft' && (
        <button type="button" onClick={() => void deleteDraft()} disabled={busy !== null} className="mx-auto flex items-center gap-1.5 py-2 text-sm font-semibold text-status-danger tap-target disabled:opacity-60">
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('survey.deleteDraft')}
        </button>
      )}
    </div>
  )
}
