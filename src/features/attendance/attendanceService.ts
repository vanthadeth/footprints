import { supabase } from '@/lib/supabase'
import { compressImageBlob } from '@/lib/image'
import type { AttendanceRow, VisitRow } from './types'

export interface ClockPayload {
  latitude: number
  longitude: number
  accuracy: number
}

/**
 * All attendance writes go through here. Business rules (must have a
 * real-time selfie, GPS, no geofence, auto check-out of an active visit on
 * clock-out) live in the `clock_in`/`clock_out` RPCs -- this layer's job is
 * only: upload the selfie, call the RPC, shape the result. Never call
 * supabase.from('attendance').insert(...) directly from a component.
 */
export const attendanceService = {
  /** Uploads a selfie under the caller's own folder, matching the storage RLS convention. */
  async uploadSelfie(userId: string, kind: 'clock-in' | 'clock-out', blob: Blob): Promise<string> {
    const compressed = await compressImageBlob(blob)
    const path = `${userId}/${kind}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('attendance').upload(path, compressed, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw error
    return path
  },

  async getOpenAttendance(userId: string): Promise<AttendanceRow | null> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .is('clock_out_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getOpenVisit(userId: string): Promise<VisitRow | null> {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('user_id', userId)
      .is('checked_out_at', null)
      .is('cancelled_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getTodayVisits(userId: string, sinceIso: string): Promise<VisitRow[]> {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('user_id', userId)
      .gte('checked_in_at', sinceIso)
      .order('checked_in_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async clockIn(userId: string, payload: ClockPayload, selfieBlob: Blob): Promise<AttendanceRow> {
    const selfiePath = await this.uploadSelfie(userId, 'clock-in', selfieBlob)
    const { data, error } = await supabase.rpc('clock_in', {
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_accuracy: payload.accuracy,
      p_selfie_path: selfiePath,
    })
    if (error) throw error
    return data
  },

  async clockOut(
    userId: string,
    payload: ClockPayload,
    selfieBlob: Blob
  ): Promise<{ attendance: AttendanceRow; autoCheckedOutVisit: VisitRow | null }> {
    const selfiePath = await this.uploadSelfie(userId, 'clock-out', selfieBlob)
    const { data, error } = await supabase.rpc('clock_out', {
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_accuracy: payload.accuracy,
      p_selfie_path: selfiePath,
    })
    if (error) throw error
    const result = data as { attendance: AttendanceRow; auto_checked_out_visit: VisitRow | null }
    return { attendance: result.attendance, autoCheckedOutVisit: result.auto_checked_out_visit }
  },
}
