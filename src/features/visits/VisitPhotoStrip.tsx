import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { visitPhotosService, type VisitPhoto, type VisitPhotoKind } from './visitPhotosService'

const MAX_PHOTOS = 3
const KINDS: { value: VisitPhotoKind; label: string }[] = [
  { value: 'shelf', label: 'Shelf' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'other', label: 'Other' },
]

/**
 * Up to three photos on a visit (shelf, receipt, other). Each one uploads
 * as soon as it's taken, so nothing is lost if check-out fails or the app
 * is closed mid-visit. Read-only when `editable` is false.
 */
export function VisitPhotoStrip({ visitId, editable }: { visitId: string; editable: boolean }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [photos, setPhotos] = useState<VisitPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [kind, setKind] = useState<VisitPhotoKind>('shelf')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    visitPhotosService
      .listForVisit(visitId)
      .then(async (rows) => {
        if (cancelled) return
        setPhotos(rows)
        const entries = await Promise.all(rows.map(async (p) => [p.id, await visitPhotosService.getUrl(p.photo_path)] as const))
        if (!cancelled) setUrls(Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e[1])))
      })
      .catch(() => {
        // Photos are a nice-to-have on the record -- a failed list just shows none.
      })
    return () => {
      cancelled = true
    }
  }, [visitId])

  async function handleFile(file: File | undefined) {
    if (!file || !userId) return
    setBusy(true)
    setError(null)
    try {
      const photo = await visitPhotosService.upload(userId, visitId, file, kind)
      setPhotos((prev) => [...prev, photo])
      setUrls((prev) => ({ ...prev, [photo.id]: URL.createObjectURL(file) }))
    } catch {
      setError('Photo upload failed. Check your connection and try again.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(photo: VisitPhoto) {
    setError(null)
    try {
      await visitPhotosService.remove(photo)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    } catch {
      setError('Could not remove that photo.')
    }
  }

  if (!editable && photos.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Photos{editable ? ' (optional)' : ''}</p>
        {editable && photos.length < MAX_PHOTOS && (
          <div role="radiogroup" aria-label="Photo type" className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  kind === k.value ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
            {urls[p.id] && <img src={urls[p.id]} alt={`${p.kind} photo`} className="h-full w-full object-cover" />}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold capitalize text-white">{p.kind}</span>
            {editable && (
              <button
                type="button"
                onClick={() => handleRemove(p)}
                aria-label={`Remove ${p.kind} photo`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3.5 w-3.5" />
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
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            <span className="text-[11px] font-semibold">{busy ? 'Uploading' : 'Add'}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-xs text-status-danger">{error}</p>}
    </div>
  )
}
