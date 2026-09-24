import type { Tables } from '@/types/database.types'

export type LeaveRequest = Tables<'leave_requests'>
export type LeaveBalanceSummary = Tables<'leave_balance_summary'>
export type LeaveType = LeaveRequest['leave_type']
export type LeaveStatus = LeaveRequest['status']

export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid']
/** Only these two are ever quota-tracked (see leave_balances/leave_balance_summary) -- unpaid has no balance row. */
export const QUOTA_TRACKED_LEAVE_TYPES: LeaveType[] = ['annual', 'sick']
