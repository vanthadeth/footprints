import { useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, Check } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'

/**
 * Real-time selfie capture only. This deliberately never renders a file
 * picker or <input type="file"> -- the only way to produce a photo here is
 * a live getUserMedia stream captured to canvas at the moment of tapping
 * the shutter, so an old gallery photo can never be used as an attendance
 * selfie (spec §11/64).
 */
export function SelfieCaptureSheet({
  open,
  title,
  onCancel,
  onCapture,
}: {
  open: boolean
  title: string
  onCancel: () => void
  onCapture: (blob: Blob) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<{ blob: Blob; url: string } | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      stopStream()
      setCaptured(null)
      setCameraError(null)
      return
    }

    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {
        if (!cancelled) setCameraError('Camera access is required to capture a selfie. Please allow camera access and try again.')
      })

    return () => {
      cancelled = true
      stopStream()
    }
  }, [open])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirror the preview back so the saved photo isn't flipped relative to what was shown.
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setCaptured({ blob, url: URL.createObjectURL(blob) })
      },
      'image/jpeg',
      0.85
    )
  }

  function retake() {
    if (captured) URL.revokeObjectURL(captured.url)
    setCaptured(null)
  }

  function confirm() {
    if (!captured) return
    onCapture(captured.blob)
  }

  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <div className="p-4">
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-neutral-900">
          {cameraError ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">{cameraError}</div>
          ) : captured ? (
            <img src={captured.url} alt="Captured selfie preview" className="h-full w-full object-cover" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          {captured ? (
            <>
              <button
                onClick={retake}
                className="flex items-center gap-2 rounded-xl bg-neutral-100 px-5 py-3 text-sm font-semibold text-neutral-700 tap-target"
              >
                <RotateCcw className="h-4 w-4" /> Retake
              </button>
              <button
                onClick={confirm}
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white tap-target"
              >
                <Check className="h-4 w-4" /> Use Photo
              </button>
            </>
          ) : (
            <button
              onClick={capture}
              disabled={!!cameraError}
              aria-label="Capture selfie"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-white shadow-card tap-target disabled:opacity-40"
            >
              <Camera className="h-7 w-7" />
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
