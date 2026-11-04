import { supabase } from '@footprints/shared/lib/supabase'
import type { SurveyPhoto } from '@footprints/shared/features/surveys/types'
import { compressImageBlob } from '@/lib/image'

interface PhotoTable {
  insert(row: Record<string, unknown>): { select(c: string): { single(): PromiseLike<{ data: unknown; error: { message: string } | null }> } }
  delete(): { eq(c: string, v: string): PromiseLike<{ error: { message: string } | null }> }
}

/** survey_photos is newer than the generated types, so it is reached untyped (rows are declared in surveys/types). */
const photoTable = () => (supabase.from as unknown as (n: string) => PhotoTable)('survey_photos')

/**
 * Photos on a survey. Files go in the private `surveys` bucket under the
 * uploader's own folder -- <user>/<survey>/<ts>.jpg, matching the storage
 * RLS in 0128 -- and a survey_photos row indexes them.
 */
export const surveyPhotosService = {
  async upload(userId: string, surveyId: string, questionId: string, blob: Blob): Promise<SurveyPhoto> {
    const compressed = await compressImageBlob(blob)
    const path = `${userId}/${surveyId}/${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage.from('surveys').upload(path, compressed, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw uploadError
    const { data, error } = await photoTable()
      .insert({ survey_id: surveyId, question_id: questionId, photo_path: path, created_by: userId })
      .select('*')
      .single()
    if (error) {
      await supabase.storage.from('surveys').remove([path])
      throw new Error(error.message)
    }
    return data as SurveyPhoto
  },

  async remove(photo: SurveyPhoto): Promise<void> {
    const { error } = await photoTable().delete().eq('id', photo.id)
    if (error) throw new Error(error.message)
    await supabase.storage.from('surveys').remove([photo.photo_path])
  },

  async getUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('surveys').createSignedUrl(path, 60 * 60)
    if (error) return null
    return data.signedUrl
  },
}
