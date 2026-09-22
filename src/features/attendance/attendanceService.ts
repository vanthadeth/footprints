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

  /** The `attendance` bucket is private, so display needs a signed URL rather than a public one -- same pattern as avatarService.getSignedUrl. */
  async getSelfieUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('attendance').createSignedUrl(path, 60 * 60)
    if (error) return null
    return data.signedUrl
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

  /** Every attendance session that started today, oldest first -- multiple clock-in/clock-out cycles per day are allowed. */
  async getTodayAttendance(userId: string, sinceIso: string): Promise<AttendanceRow[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .gte('clock_in_at', sinceIso)
      .order('clock_in_at', { ascending: true })
    if (error) throw error
    return data ?? []
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

  /**
   * Called periodically (see useJourney) once the device clock suggests
   * we're past work_end_time + the admin's grace period. No selfie -- this
   * is a system action, not a person confirming they're leaving -- but a
   * fresh location fix is still required (never fabricate one). The server
   * re-validates the time against its own clock and the live settings
   * before actually closing anything out.
   */
  async enforceWorkingHours(
    payload: ClockPayload
  ): Promise<{ autoClockedOut: boolean; attendance: AttendanceRow | null; autoCheckedOutVisit: VisitRow | null }> {
    const { data, error } = await supabase.rpc('enforce_working_hours', {
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_accuracy: payload.accuracy,
    })
    if (error) throw error
    const result = data as { auto_clocked_out: boolean; attendance: AttendanceRow | null; auto_checked_out_visit: VisitRow | null }
    return {
      autoClockedOut: result.auto_clocked_out,
      attendance: result.attendance ?? null,
      autoCheckedOutVisit: result.auto_checked_out_visit ?? null,
    }
  },
}
