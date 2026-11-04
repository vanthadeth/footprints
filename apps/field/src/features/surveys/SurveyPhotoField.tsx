import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import type { SurveyPhoto } from '@footprints/shared/features/surveys/types'
import { surveyPhotosService } from './surveyPhotosService'

const MAX_PHOTOS = 3

/**
 * Photos for one photo question. A photo needs the survey to exist, so the
 * first one asks the form to save a draft (ensureSaved) before it uploads;
 * each photo uploads as soon as it's taken.
 */
export function SurveyPhotoField({
  questionId,
  initial,
  editable,
  ensureSaved,
  onCount,
}: {
  questionId: string
  initial: SurveyPhoto[]
  editable: boolean
  /** Saves the survey as a draft if it isn't saved yet and returns its id (null if that failed). */
  ensureSaved: () => Promise<string | null>
  onCount: (n: number) => void
}) {
  const { t } = useLanguage()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [photos, setPhotos] = useState<SurveyPhoto[]>(initial)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all(initial.map(async (p) => [p.id, await surveyPhotosService.getUrl(p.photo_path)] as const)).then((entries) => {
      if (!cancelled) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e[1])) }))
    })
    return () => {
      cancelled = true
    }
    // The initial photos are those loaded with the survey; later ones are added locally below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(file: File | undefined) {
    if (!file || !userId) return
    setBusy(true)
    setError(null)
    try {
      const surveyId = await ensureSaved()
      if (!surveyId) return
      const photo = await surveyPhotosService.upload(userId, surveyId, questionId, file)
      const next = [...photos, photo]
      setPhotos(next)
      setUrls((prev) => ({ ...prev, [photo.id]: URL.createObjectURL(file) }))
      onCount(next.length)
    } catch {
      setError(t('survey.saveFailed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(photo: SurveyPhoto) {
    setError(null)
    try {
      await surveyPhotosService.remove(photo)
      const next = photos.filter((p) => p.id !== photo.id)
      setPhotos(next)
      onCount(next.length)
    } catch {
      setError(t('survey.saveFailed'))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
            {urls[p.id] && <img src={urls[p.id]} alt="" className="h-full w-full object-cover" />}
            {editable && (
              <button
                type="button"
                onClick={() => void handleRemove(p)}
                aria-label={t('survey.removePhoto')}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {editable && photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || !userId}
            className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 text-neutral-500 tap-target disabled:opacity-60 dark:border-neutral-600 dark:text-neutral-400"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
            <span className="text-[11px] font-semibold">{busy ? t('survey.saving') : t('survey.addPhoto')}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
      {error && <p className="mt-2 text-xs text-status-danger">{error}</p>}
    </div>
  )
}
