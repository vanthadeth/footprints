import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, Loader2, User } from 'lucide-react'
import { avatarService } from './avatarService'
import { useAvatarUrl } from './useAvatarUrl'
import { haptic } from '@/lib/haptic'

/**
 * Avatar with a camera-icon edit button overlaid at the corner. Unlike the
 * attendance selfie flow, this deliberately allows picking from the
 * gallery too (no `capture` attribute) -- there's no verification purpose
 * here, it's just a profile photo.
 */
export function AvatarPicker({
  userId,
  photoPath,
  onUploaded,
}: {
  userId: string
  photoPath: string | null
  onUploaded: () => void
}) {
  const url = useAvatarUrl(photoPath)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets picking the same file again re-trigger onChange
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await avatarService.uploadAvatar(userId, file)
      haptic('success')
      onUploaded()
    } catch (err) {
      haptic('error')
      setError(err instanceof Error ? err.message : 'Failed to update photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative inline-block">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User className="h-10 w-10" aria-hidden />}
      </div>
      <button
        type="button"
        onClick={() => {
          haptic('light')
          inputRef.current?.click()
        }}
        disabled={uploading}
        aria-label="Change profile picture"
        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow-card disabled:opacity-60 dark:border-neutral-900"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      {error && (
        <p role="alert" className="absolute left-1/2 top-full mt-2 w-40 -translate-x-1/2 text-center text-xs text-status-danger">
          {error}
        </p>
      )}
    </div>
  )
}
