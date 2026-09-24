import type { Tables } from '@/types/database.types'

export type LeaveRequest = Tables<'leave_requests'>
export type LeaveBalanceSummary = Tables<'leave_balance_summary'>
export type LeaveType = LeaveRequest['leave_type']
export type LeaveStatus = LeaveRequest['status']
export type LeaveDayPeriod = LeaveRequest['start_period']

export const LEAVE_DAY_PERIOD_LABEL: Record<LeaveDayPeriod, string> = { full: 'Full Day', morning: 'Morning', afternoon: 'Afternoon' }

export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid']
/** Only these two are ever quota-tracked (see leave_balances/leave_balance_summary) -- unpaid has no balance row. */
export const QUOTA_TRACKED_LEAVE_TYPES: LeaveType[] = ['annual', 'sick']

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid' }

/** Hex per leave type -- balance bars, calendar cells and chips all key off the same colour. */
export const LEAVE_TYPE_COLOR: Record<LeaveType, string> = { annual: '#1668b8', sick: '#0f6e4f', unpaid: '#96703f' }
