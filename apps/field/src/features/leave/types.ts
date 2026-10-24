import type { Tables } from '@footprints/shared/types/database.types'

export type LeaveRequest = Tables<'leave_requests'>
export type LeaveBalanceSummary = Tables<'leave_balance_summary'>
export type LeaveType = LeaveRequest['leave_type']
export type LeaveStatus = LeaveRequest['status']
export type LeaveDayPeriod = LeaveRequest['start_period']

export const LEAVE_DAY_PERIOD_LABEL: Record<LeaveDayPeriod, string> = { full: 'Full Day', morning: 'Morning', afternoon: 'Afternoon' }

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', flex: 'Flexible day off' }

/** "Annual Leave", "Sick Leave" … but a flexible day off is just that. */
export function leaveTitle(type: LeaveType): string {
  return type === 'flex' ? 'Flexible day off' : `${LEAVE_TYPE_LABEL[type]} Leave`
}

/** Hex per leave type -- balance bars, calendar cells and chips all key off the same colour. */
export const LEAVE_TYPE_COLOR: Record<LeaveType, string> = { annual: '#006ACC', sick: '#00952A', unpaid: '#96703f', flex: '#6552c9' }
