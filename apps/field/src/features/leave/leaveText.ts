import { enT, type Tr } from '@/features/customers/book'
import type { LeaveDayPeriod, LeaveStatus, LeaveType } from './types'

const TYPE_KEY: Record<LeaveType, string> = { annual: 'typeAnnual', sick: 'typeSick', unpaid: 'typeUnpaid', flex: 'typeFlex' }
const TITLE_KEY: Record<LeaveType, string> = { annual: 'titleAnnual', sick: 'titleSick', unpaid: 'titleUnpaid', flex: 'typeFlex' }
const PERIOD_KEY: Record<LeaveDayPeriod, string> = { full: 'periodFull', morning: 'periodMorning', afternoon: 'periodAfternoon' }
const STATUS_KEY: Record<LeaveStatus, string> = { pending: 'statusPending', approved: 'statusApproved', rejected: 'statusRejected', cancelled: 'statusCancelled' }

/** "Annual", "Sick", "Unpaid", "Flexible day off". */
export const leaveTypeName = (type: LeaveType, t: Tr = enT) => t(`leave.${TYPE_KEY[type]}`)
/** "Annual Leave" … a flexible day off is just that. */
export const leaveTitleOf = (type: LeaveType, t: Tr = enT) => t(`leave.${TITLE_KEY[type]}`)
export const periodName = (p: LeaveDayPeriod, t: Tr = enT) => t(`leave.${PERIOD_KEY[p]}`)
export const statusName = (s: LeaveStatus, t: Tr = enT) => t(`leave.${STATUS_KEY[s]}`)
