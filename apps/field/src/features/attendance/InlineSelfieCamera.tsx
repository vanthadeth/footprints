import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'

/**
 * The live camera inside the clock sheet (canvas Clock in, step 1). Same rule as
 * SelfieCaptureSheet: the only way to make a photo is a getUserMedia stream captured
 * at the moment of the tap, never a file picker, so an old gallery photo can't be used.
 */
export function InlineSelfieCamera({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const { t } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop())
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => !cancelled && setError(t('checkIn.cameraNeeded')))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
    // t is stable per language; restarting the stream on it would blink the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirror back so the saved photo isn't flipped relative to the preview.
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => blob && onCapture(blob), 'image/jpeg', 0.85)
  }

  return (
    <div className="relative aspect-[358/480] overflow-hidden rounded-[22px] bg-[#0e0f12]">
      {!error && <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />}
      <span className="absolute left-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-bold text-white backdrop-blur">
        <Camera className="h-3.5 w-3.5" aria-hidden />
        {t('checkIn.frontCamera')}
      </span>
      <button type="button" onClick={() => setNonce((n) => n + 1)} aria-label={t('checkIn.refresh')} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
        <RefreshCw className="h-4 w-4" aria-hidden />
      </button>
      {error ? (
        <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-white">{error}</p>
      ) : (
        <>
          <svg className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2" width="170" height="220" viewBox="0 0 170 220" aria-hidden>
            <ellipse cx="85" cy="110" rx="82" ry="107" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2.5" strokeDasharray="9 8" />
          </svg>
          <p className="absolute inset-x-0 bottom-[84px] text-center text-[13px] font-semibold text-white/90">{t('checkIn.centerFace')}</p>
          <button type="button" onClick={capture} aria-label={t('checkIn.takeSelfie')} className="absolute bottom-3 left-1/2 flex h-[68px] w-[68px] -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-white">
            <span className="h-[54px] w-[54px] rounded-full bg-white" />
          </button>
        </>
      )}
    </div>
  )
}
