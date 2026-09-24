import { supabase } from '@/lib/supabase'
import type { LeaveBalanceSummary, LeaveRequest, LeaveType } from './types'

export interface RequestLeavePayload {
  leaveType: LeaveType
  startDate: string
  endDate: string
  startHalfDay: boolean
  endHalfDay: boolean
  reason: string | null
}

/**
 * All leave writes go through the app.request_leave/cancel_leave_request/
 * decide_leave_request/set_leave_balance RPCs (quota, overlap, and
 * no-self-approval rules live server-side) -- same convention as
 * attendanceService, never a raw table insert/update from a component.
 * Reads rely on RLS (app.can('leave'/'leave_balance', ...)) to scope
 * results automatically, same as fleetService/reportsService.
 */
export const leaveService = {
  /** Every leave request the caller can see (their own, plus their team's if they're a manager/HR/Super Admin), newest first. */
  async listRequests(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase.from('leave_requests').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listBalances(year: number): Promise<LeaveBalanceSummary[]> {
    const { data, error } = await supabase.from('leave_balance_summary').select('*').eq('year', year)
    if (error) throw error
    return data ?? []
  },

  async requestLeave(payload: RequestLeavePayload): Promise<LeaveRequest> {
    const { data, error } = await supabase.rpc('request_leave', {
      p_leave_type: payload.leaveType,
      p_start_date: payload.startDate,
      p_end_date: payload.endDate,
      p_start_half_day: payload.startHalfDay,
      p_end_half_day: payload.endHalfDay,
      // The generated type marks this as a required string (the SQL param
      // has a DEFAULT but no explicit `| null` in its signature), but the
      // RPC accepts NULL fine -- same workaround as usersService.setTelegramId.
      p_reason: payload.reason as string | undefined,
    })
    if (error) throw error
    return data
  },

  async cancelLeaveRequest(id: string): Promise<LeaveRequest> {
    const { data, error } = await supabase.rpc('cancel_leave_request', { p_id: id })
    if (error) throw error
    return data
  },

  async decideLeaveRequest(id: string, approve: boolean, note: string | null): Promise<LeaveRequest> {
    const { data, error } = await supabase.rpc('decide_leave_request', { p_id: id, p_approve: approve, p_note: note as string | undefined })
    if (error) throw error
    return data
  },

  async setLeaveBalance(userId: string, leaveType: LeaveType, year: number, quotaDays: number): Promise<void> {
    const { error } = await supabase.rpc('set_leave_balance', {
      p_user_id: userId,
      p_leave_type: leaveType,
      p_year: year,
      p_quota_days: quotaDays,
    })
    if (error) throw error
  },
}

/** The friendly text from a raised RPC exception (e.g. app.request_leave's over_quota/overlapping_request), falling back to the raw error message. */
export function leaveErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { details?: string; message?: string }
    if (e.details) return e.details
    if (e.message) return e.message
  }
  return 'Something went wrong.'
}
