import { supabase } from '@/lib/supabase'
import { compressImageBlob } from '@/lib/image'
import type { Tables } from '@/types/database.types'

export type VisitPhotoKind = 'shelf' | 'receipt' | 'other'
export type VisitPhoto = Tables<'visit_photos'>

/**
 * Photos attached to a visit (shelf, receipt, ...). Files go in the private
 * `visits` bucket under the uploader's own folder -- <user>/<visit>/<ts>.jpg,
 * matching the storage RLS in 0086 -- and a visit_photos row indexes them.
 */
export const visitPhotosService = {
  async upload(userId: string, visitId: string, blob: Blob, kind: VisitPhotoKind): Promise<VisitPhoto> {
    const compressed = await compressImageBlob(blob)
    const path = `${userId}/${visitId}/${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('visits').upload(path, compressed, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw uploadError
    const { data, error } = await supabase
      .from('visit_photos')
      .insert({ visit_id: visitId, photo_path: path, kind, created_by: userId })
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async listForVisit(visitId: string): Promise<VisitPhoto[]> {
    const { data, error } = await supabase.from('visit_photos').select('*').eq('visit_id', visitId).order('created_at')
    if (error) throw error
    return data ?? []
  },

  async remove(photo: VisitPhoto): Promise<void> {
    const { error } = await supabase.from('visit_photos').delete().eq('id', photo.id)
    if (error) throw error
    await supabase.storage.from('visits').remove([photo.photo_path])
  },

  async getUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('visits').createSignedUrl(path, 60 * 60)
    if (error) return null
    return data.signedUrl
  },
}
