import { supabase } from '@/lib/supabase'
import type { VisitRow } from '@/features/attendance/types'

export interface NearbyCustomer {
  id: string
  shop_name: string
  business_type: string
  street_address: string
  distance_m: number
}

export interface LocationPingResult {
  autoCheckedOut: boolean
  visit: VisitRow | null
}

/** The visit-outcome fields captured by the visit record form, all optional at the RPC level (check_out only overwrites a field when it's actually passed -- see the COALESCE in app._close_visit). */
export interface VisitOutcomeDetails {
  visitTypeId?: string | null
  visitStatusId?: string | null
  orderStatusId?: string | null
  paymentStatusId?: string | null
  /** ISO timestamp. */
  nextAppointment?: string | null
  remarks?: string | null
  /** Order value in USD ("order value only" -- no product lines). */
  orderAmountUsd?: number | null
  /** Amount collected on this visit, USD. */
  collectedUsd?: number | null
}

/**
 * Customer visit (Check In / Check Out) writes. Like attendanceService,
 * this only shapes RPC calls -- no geofence logic lives here, that's all
 * server-side (app.check_in has no radius restriction on purpose).
 */
export const visitsService = {
  async nearbyCustomers(latitude: number, longitude: number, limit = 20): Promise<NearbyCustomer[]> {
    const { data, error } = await supabase.rpc('nearby_customers', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_limit: limit,
    })
    if (error) throw error
    return data ?? []
  },

  async checkIn(
    customerId: string | null,
    latitude: number,
    longitude: number,
    accuracy: number
  ): Promise<VisitRow> {
    const { data, error } = await supabase.rpc('check_in', {
      // The generated type marks p_customer as a required string because the
      // SQL parameter has no DEFAULT -- but the RPC (and Postgres uuid
      // params generally) accepts NULL fine, and an unassigned visit
      // legitimately needs to send it.
      p_customer: customerId as string,
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy: accuracy,
    })
    if (error) throw error
    return data
  },

  async checkOut(
    visitId: string,
    latitude: number,
    longitude: number,
    accuracy: number,
    details?: VisitOutcomeDetails
  ): Promise<VisitRow> {
    const { data, error } = await supabase.rpc('check_out', {
      p_visit: visitId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy: accuracy,
      // `?? undefined` rather than passing a possible `null` straight
      // through -- the generated types mark these as optional `string`
      // (they have SQL DEFAULTs, so the key can be omitted), not
      // `string | null`, even though Postgres itself is fine with an
      // explicit NULL for uuid/text/timestamptz params.
      p_visit_type_id: details?.visitTypeId ?? undefined,
      p_visit_status_id: details?.visitStatusId ?? undefined,
      p_order_status_id: details?.orderStatusId ?? undefined,
      p_payment_status_id: details?.paymentStatusId ?? undefined,
      p_next_appointment: details?.nextAppointment ?? undefined,
      p_remarks: details?.remarks ?? undefined,
      p_order_amount_usd: details?.orderAmountUsd ?? undefined,
      p_collected_usd: details?.collectedUsd ?? undefined,
    })
    if (error) throw error
    return data
  },

  /** Cancels a still-open visit outright (a wrong/accidental check-in) -- no checkout record, no outcome fields, just gone from the active journey. */
  async cancelVisit(visitId: string, reason?: string): Promise<VisitRow> {
    const { data, error } = await supabase.rpc('cancel_visit', {
      p_visit: visitId,
      p_reason: reason ?? undefined,
    })
    if (error) throw error
    return data
  },

  /**
   * Overwrites a visit's record fields (unlike checkOut's _close_visit,
   * which only ever fills in a field left blank) -- the visit-detail edit
   * sheet sends the whole edited state, including clearing a field back
   * out. Only allowed within 24h of check-in (app.update_visit_record).
   */
  async updateVisitRecord(visitId: string, details: VisitOutcomeDetails): Promise<VisitRow> {
    const { data, error } = await supabase.rpc('update_visit_record', {
      p_visit: visitId,
      p_visit_type_id: details.visitTypeId ?? undefined,
      p_visit_status_id: details.visitStatusId ?? undefined,
      p_order_status_id: details.orderStatusId ?? undefined,
      p_payment_status_id: details.paymentStatusId ?? undefined,
      p_next_appointment: details.nextAppointment ?? undefined,
      p_remarks: details.remarks ?? undefined,
      p_order_amount_usd: details.orderAmountUsd ?? undefined,
      p_collected_usd: details.collectedUsd ?? undefined,
    })
    if (error) throw error
    return data
  },

  /** Voids any of your own visits, open or closed -- unlike cancelVisit, not limited to a still-open one. */
  async voidVisit(visitId: string, reason?: string): Promise<VisitRow> {
    const { data, error } = await supabase.rpc('void_visit', {
      p_visit: visitId,
      p_reason: reason ?? undefined,
    })
    if (error) throw error
    return data
  },

  /** Restores a voided visit. Server rejects it if it was open when voided and another visit is open now (only one can ever be open at a time). */
  async unvoidVisit(visitId: string): Promise<VisitRow> {
    const { data, error } = await supabase.rpc('unvoid_visit', { p_visit: visitId })
    if (error) throw error
    return data
  },

  async recordLocationPing(
    visitId: string,
    latitude: number,
    longitude: number,
    accuracy: number
  ): Promise<LocationPingResult> {
    const { data, error } = await supabase.rpc('record_location_ping', {
      p_visit: visitId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy: accuracy,
    })
    if (error) throw error
    const result = data as { auto_checked_out: boolean; visit: VisitRow | null }
    return { autoCheckedOut: result.auto_checked_out, visit: result.visit }
  },

  async getCustomer(customerId: string) {
    const { data, error } = await supabase.from('customers').select('id, shop_name').eq('id', customerId).maybeSingle()
    if (error) throw error
    return data
  },
}
