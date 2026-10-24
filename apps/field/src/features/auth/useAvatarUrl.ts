import { useEffect, useState } from 'react'
import { avatarService } from './avatarService'

/** Resolves a `users.photo_path` (a storage path, not a URL -- the bucket is private) into a displayable signed URL. */
export function useAvatarUrl(photoPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photoPath) {
      setUrl(null)
      return
    }
    let cancelled = false
    avatarService.getSignedUrl(photoPath).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl)
    })
    return () => {
      cancelled = true
    }
  }, [photoPath])

  return url
}
