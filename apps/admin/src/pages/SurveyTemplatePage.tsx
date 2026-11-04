import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { surveysService } from '@footprints/shared/features/surveys/surveysService'
import { moveItem, newQuestionDraft, newUid, questionsPayload, templateProblem } from '@footprints/shared/features/surveys/surveyForm'
import { QUESTION_TYPES, QUESTION_TYPE_LABEL, type QuestionDraft, type QuestionType, type SurveyQuestion, type TargetKind, type TemplateVersion } from '@footprints/shared/features/surveys/types'
import { Field, Section, Select, TextInput, Toggle } from '@/components/form'

const BTN = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50'

function toDraft(q: SurveyQuestion): QuestionDraft {
  return {
    uid: q.id,
    type: q.type,
    label: q.label,
    label_alt: q.label_alt ?? '',
    required: q.required,
    options: q.options.map((o) => ({ uid: newUid(), key: o.key, label: o.label, label_alt: o.label_alt ?? '' })),
  }
}

/**
 * Survey template builder (/surveys/templates/:id, "new" to create). Saving
 * writes the draft version; Publish freezes it and makes it the version
 * salespeople fill in. A published version never changes -- editing starts
 * a new draft -- so answers already collected keep their questions.
 */
export function SurveyTemplatePage() {
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)

  const [title, setTitle] = useState('')
  const [titleAlt, setTitleAlt] = useState('')
  const [targetKind, setTargetKind] = useState<TargetKind>('category')
  const [categoryId, setCategoryId] = useState('')
  const [itemId, setItemId] = useState('')
  const [itemFilter, setItemFilter] = useState('')
  const [active, setActive] = useState(true)
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [versions, setVersions] = useState<TemplateVersion[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null }[]>([])
  const [items, setItems] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cats, its] = await Promise.all([surveysService.categories(), surveysService.items()])
      if (cancelled) return
      setCategories(cats)
      setItems(its)
      if (isNew) return
      const [tpl, vs] = await Promise.all([surveysService.template(id), surveysService.versions(id)])
      if (!tpl || cancelled) throw new Error('Template not found.')
      setTitle(tpl.title)
      setTitleAlt(tpl.title_alt ?? '')
      setTargetKind(tpl.target_kind)
      setCategoryId(tpl.category_id ?? '')
      setItemId(tpl.item_id ?? '')
      setActive(tpl.active)
      setVersions(vs)
      // The newest version: the draft being worked on, else the published one to base a new draft on.
      if (vs[0]) setQuestions((await surveysService.questions(vs[0].id)).map(toDraft))
    })()
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the template.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const shownItems = useMemo(() => {
    const q = itemFilter.trim().toLowerCase()
    const list = q === '' ? items : items.filter((i) => i.name.toLowerCase().includes(q))
    const chosen = items.find((i) => i.id === itemId)
    return (chosen && !list.some((i) => i.id === chosen.id) ? [chosen, ...list] : list).slice(0, 200)
  }, [items, itemFilter, itemId])

  const latest = versions[0] ?? null
  const hasDraft = !!latest && latest.published_at === null
  const targetMissing = targetKind === 'category' ? categoryId === '' : itemId === ''
  const problem = templateProblem(title, questions) ?? (targetMissing ? 'Choose the product or category this survey is about.' : null)

  const patchQuestion = (uid: string, change: Partial<QuestionDraft>) => setQuestions((qs) => qs.map((q) => (q.uid === uid ? { ...q, ...change } : q)))

  async function save(publish: boolean) {
    if (problem) {
      setError(problem)
      return
    }
    if (publish && !window.confirm('Publish this template? Salespeople will fill in this version, and its questions can no longer change (you can start a new version later).')) return
    setBusy(publish ? 'publish' : 'save')
    setError(null)
    setNotice(null)
    try {
      const tid = await surveysService.saveTemplate({
        templateId: isNew ? null : id,
        title: title.trim(),
        titleAlt: titleAlt.trim(),
        targetKind,
        itemId: itemId || null,
        categoryId: categoryId || null,
        questions: questionsPayload(questions),
        publish,
      })
      if (isNew) {
        navigate(`/surveys/templates/${tid}`, { replace: true })
        return
      }
      const vs = await surveysService.versions(tid)
      setVersions(vs)
      setNotice(publish ? `Published as version ${vs[0]?.version_no}.` : 'Draft saved.')
    } catch (e) {
      setError((e as { details?: string }).details ?? (e instanceof Error ? e.message : 'Could not save the template.'))
    } finally {
      setBusy(null)
    }
  }

  async function toggleActive(next: boolean) {
    if (isNew) return
    try {
      await surveysService.setTemplateActive(id, next)
      setActive(next)
    } catch {
      setError('Could not change the template’s status.')
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl p-8 text-sm text-neutral-500">Loading…</div>

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div>
        <Link to="/surveys" className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-300">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Surveys
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{isNew ? 'New survey template' : title || 'Survey template'}</h1>
          {!isNew && latest && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${hasDraft ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
              {hasDraft ? `Draft v${latest.version_no}` : `Published v${latest.version_no}`}
              {hasDraft && versions[1]?.published_at ? ` · live is v${versions[1].version_no}` : ''}
            </span>
          )}
        </div>
      </div>

      <Section title="Template">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title · English">
            <TextInput value={title} onChange={setTitle} placeholder="Instant noodles market check" />
          </Field>
          <Field label="Title · ខ្មែរ">
            <TextInput value={titleAlt} onChange={setTitleAlt} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Survey is about">
            <Select value={targetKind} onChange={(v) => setTargetKind(v as TargetKind)}>
              <option value="category">A category</option>
              <option value="item">A single product</option>
            </Select>
          </Field>
          {targetKind === 'category' ? (
            <Field label="Category">
              <Select value={categoryId} onChange={setCategoryId} placeholder="Choose a category">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? `${categoryName.get(c.parent_id) ?? ''} › ` : ''}
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Product">
              <div className="space-y-2">
                <TextInput value={itemFilter} onChange={setItemFilter} placeholder="Search products" />
                <Select value={itemId} onChange={setItemId} placeholder="Choose a product">
                  {shownItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          )}
        </div>
        {!isNew && <Toggle checked={active} onChange={(v) => void toggleActive(v)} label="Active: salespeople can start new surveys from it" />}
      </Section>

      <Section title={`Questions · ${questions.length}`}>
        {questions.length === 0 && <p className="text-sm text-neutral-500">No questions yet. Add the first one below.</p>}
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.uid} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                  {i + 1} · {QUESTION_TYPE_LABEL[q.type]}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => setQuestions((qs) => moveItem(qs, i, i - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800">
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === questions.length - 1} onClick={() => setQuestions((qs) => moveItem(qs, i, i + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800">
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" aria-label="Remove question" onClick={() => setQuestions((qs) => qs.filter((x) => x.uid !== q.uid))} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 dark:hover:bg-neutral-800">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Question · English">
                  <TextInput value={q.label} onChange={(v) => patchQuestion(q.uid, { label: v })} />
                </Field>
                <Field label="Question · ខ្មែរ">
                  <TextInput value={q.label_alt} onChange={(v) => patchQuestion(q.uid, { label_alt: v })} />
                </Field>
              </div>
              <Toggle checked={q.required} onChange={(v) => patchQuestion(q.uid, { required: v })} label="Required" />

              {(q.type === 'single' || q.type === 'multi') && (
                <div className="space-y-2">
                  <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">Answer options</span>
                  {q.options.map((o, oi) => (
                    <div key={o.uid} className="flex items-center gap-2">
                      <div className="grid flex-1 gap-2 md:grid-cols-2">
                        <TextInput value={o.label} placeholder="English" onChange={(v) => patchQuestion(q.uid, { options: q.options.map((x) => (x.uid === o.uid ? { ...x, label: v } : x)) })} />
                        <TextInput value={o.label_alt} placeholder="ខ្មែរ" onChange={(v) => patchQuestion(q.uid, { options: q.options.map((x) => (x.uid === o.uid ? { ...x, label_alt: v } : x)) })} />
                      </div>
                      <button type="button" aria-label="Move option up" disabled={oi === 0} onClick={() => patchQuestion(q.uid, { options: moveItem(q.options, oi, oi - 1) })} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800">
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button type="button" aria-label="Remove option" onClick={() => patchQuestion(q.uid, { options: q.options.filter((x) => x.uid !== o.uid) })} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 dark:hover:bg-neutral-800">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => patchQuestion(q.uid, { options: [...q.options, { uid: newUid(), key: '', label: '', label_alt: '' }] })} className="text-sm font-semibold text-brand-600">
                    + Add option
                  </button>
                </div>
              )}
              {q.type === 'brand_price' && <p className="text-xs text-neutral-500">Salespeople add one line per brand: a brand from the brands list (or a typed name), the purchase price in USD, and the unit.</p>}
              {q.type === 'rating' && <p className="text-xs text-neutral-500">A 1–5 star rating.</p>}
              {q.type === 'photo' && <p className="text-xs text-neutral-500">Up to three photos.</p>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Select value="" onChange={(v) => v && setQuestions((qs) => [...qs, newQuestionDraft(v as QuestionType)])} placeholder="+ Add a question…">
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
      </Section>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy !== null} onClick={() => void save(false)} className={`${BTN} border border-neutral-300 bg-white text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100`}>
          {busy === 'save' ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void save(true)} className={`${BTN} bg-brand-500 text-white`}>
          <Plus className="h-4 w-4" aria-hidden />
          {busy === 'publish' ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
