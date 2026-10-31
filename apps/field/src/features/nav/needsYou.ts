import { CalendarCheck, CheckSquare, MessageSquare, RefreshCw, Route, Sun, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Tr } from '@/features/customers/book'
import type { RoleGroup } from './navConfig'

export interface NeedsData {
  /** Leave requests and sales trips from other people waiting for the caller. */
  toDecide: number
  /** The caller's own pending leave requests. */
  ownPending: number
  plannedStops: number
  nextStop: string | null
  annualLeft: number | null
  /** People on flexible days off who cannot reach their minimum this cycle. */
  shortPeople: { name: string; have: number; min: number }[]
  nextHoliday: { name: string; inDays: number } | null
  unreadMessages: number
  /** "HH:mm" of today's open clock-in. */
  onShiftSince: string | null
  lastSync: { ok: boolean; time: string } | null
}

export interface NeedLine {
  key: string
  tone: 'ok' | 'warn' | 'brand'
  icon: LucideIcon
  title: string
  sub: string
  to: string
}

const names = (list: { name: string }[]) => list.slice(0, 2).map((p) => p.name).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '')

/**
 * The Hub's "Needs you" lines for a role group: up to three, each only when
 * there is something real to say (nothing is made up), most urgent first.
 */
export function needsYouLines(group: RoleGroup, d: NeedsData, t: Tr): NeedLine[] {
  const decide: NeedLine | null = d.toDecide > 0 ? { key: 'decide', tone: 'warn', icon: CheckSquare, title: t('hubNeeds.toDecide', { n: d.toDecide }), sub: t('hubNeeds.toDecideSub'), to: '/approvals' } : null
  const short: NeedLine | null = d.shortPeople.length ? { key: 'short', tone: 'brand', icon: CalendarCheck, title: t('hubNeeds.shortPeople', { n: d.shortPeople.length }), sub: names(d.shortPeople), to: '/leave/flexible' } : null
  const holiday: NeedLine | null = d.nextHoliday ? { key: 'holiday', tone: 'ok', icon: Sun, title: t('hubNeeds.holiday', { name: d.nextHoliday.name }), sub: t(d.nextHoliday.inDays === 0 ? 'hubNeeds.today' : d.nextHoliday.inDays === 1 ? 'hubNeeds.tomorrow' : 'hubNeeds.inDays', { n: d.nextHoliday.inDays }), to: '/admin/attendance?tab=holiday' } : null
  const messages: NeedLine | null = d.unreadMessages > 0 ? { key: 'messages', tone: 'brand', icon: MessageSquare, title: t('hubNeeds.messages', { n: d.unreadMessages }), sub: t('hubNeeds.messagesSub'), to: '/messages' } : null
  let lines: (NeedLine | null)[]
  switch (group) {
    case 'field':
      lines = [
        d.plannedStops > 0
          ? { key: 'plan', tone: 'brand', icon: Route, title: t('hubNeeds.stops', { n: d.plannedStops }), sub: d.nextStop ? t('hubNeeds.nextStop', { name: d.nextStop }) : t('hubNeeds.openPlan'), to: '/plan' }
          : { key: 'plan', tone: 'warn', icon: Route, title: t('hubNeeds.noPlan'), sub: t('hubNeeds.makePlan'), to: '/plan' },
        d.annualLeft != null ? { key: 'leave', tone: 'ok', icon: CalendarCheck, title: t('hubNeeds.leaveLeft', { n: d.annualLeft }), sub: d.ownPending > 0 ? t('hubNeeds.ownPending', { n: d.ownPending }) : t('hubNeeds.annualLeave'), to: '/leave?tab=balance' } : null,
      ]
      break
    case 'manager':
      lines = [decide, short, messages]
      break
    case 'hr':
      lines = [decide, short, holiday]
      break
    case 'office':
      lines = [
        messages,
        d.onShiftSince ? { key: 'shift', tone: 'ok', icon: CalendarCheck, title: t('hubNeeds.onShift', { time: d.onShiftSince }), sub: t('hubNeeds.onShiftSub'), to: '/check-in' } : null,
        d.ownPending > 0 ? { key: 'own', tone: 'warn', icon: CalendarCheck, title: t('hubNeeds.ownPending', { n: d.ownPending }), sub: t('hubNeeds.annualLeave'), to: '/leave' } : null,
      ]
      break
    default:
      lines = [
        decide,
        d.lastSync ? { key: 'sync', tone: d.lastSync.ok ? 'ok' : 'warn', icon: d.lastSync.ok ? RefreshCw : TriangleAlert, title: t(d.lastSync.ok ? 'hubNeeds.syncOk' : 'hubNeeds.syncFailed'), sub: t('hubNeeds.lastRun', { time: d.lastSync.time }), to: '/admin/sync' } : null,
        short,
      ]
  }
  return lines.filter((l): l is NeedLine => !!l).slice(0, 3)
}
