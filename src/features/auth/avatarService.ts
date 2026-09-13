import { supabase } from '@/lib/supabase'
import { compressImageBlob } from '@/lib/image'

/** Signed URLs are cheap to reissue but not indefinite -- an hour comfortably outlives a single page view. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

export const avatarService = {
  /** Uploads under the caller's own folder, matching the `avatars` bucket's storage RLS convention (first path segment = owner's user id). */
  async uploadAvatar(userId: string, blob: Blob): Promise<string> {
    const compressed = await compressImageBlob(blob)
    const path = `${userId}/avatar-${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, compressed, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw uploadError

    const { error: updateError } = await supabase.from('users').update({ photo_path: path }).eq('id', userId)
    if (updateError) throw updateError

    return path
  },

  /** The `avatars` bucket is private, so display needs a signed URL rather than a public one. */
  async getSignedUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (error) return null
    return data.signedUrl
  },
}
