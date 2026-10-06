import {
  BarChart3,
  Bell,
  Building2,
  Calendar as CalendarIcon,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Clock,
  FileSpreadsheet,
  Footprints as FootprintsIcon,
  Map as MapIcon,
  History,
  Languages,
  LayoutGrid,
  MapPin,
  MessagesSquare,
  Network,
  Route,
  Scale,
  Settings,
  ShieldCheck,
  Store,
  Table2,
  UserRound,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import type { Action, Scope } from '@/features/permissions/catalog'

/**
 * Role-based navigation (canvas: "Navigation by role"): each person falls in
 * one group, picked from their permissions -- not their role's name, so new
 * or custom roles land in the right place -- and each group gets its own
 * tabs, Hub "For you" shortcuts and Hub sections. Every screen stays
 * reachable from Hub for anyone allowed to use it.
 */
export type RoleGroup = 'field' | 'manager' | 'hr' | 'office' | 'admin'

export interface NavContext {
  isSuperAdmin: boolean
  scope: (module: string, action: Action) => Scope | null
  /** On flexible (travel) days off -- shows "My days off". */
  flexible?: boolean
}

/** First match wins: Admin → HR → Manager → Field → Office. */
export function roleGroup(ctx: NavContext): RoleGroup {
  const s = ctx.scope
  if (ctx.isSuperAdmin || s('role_permission', 'edit')) return 'admin'
  const hasTeam = s('team_map', 'view') === 'sub' || s('leave', 'edit') === 'sub'
  if (s('leave_balance', 'edit') === 'any' && !hasTeam) return 'hr'
  if (hasTeam || s('leave', 'edit') === 'any') return 'manager'
  if (s('plan', 'view') || s('footprints', 'view') || s('visit', 'add')) return 'field'
  return 'office'
}

/** Can the person approve other people's leave or sales trips (edit at Team or All)? */
export function canApprove(ctx: NavContext): boolean {
  const e = ctx.scope('leave', 'edit')
  const trip = ctx.scope('sales_trip', 'edit')
  return ctx.isSuperAdmin || e === 'sub' || e === 'any' || trip === 'sub' || trip === 'any'
}

type Need = (ctx: NavContext) => boolean
const can = (module: string, action: Action = 'view'): Need => (ctx) => ctx.isSuperAdmin || ctx.scope(module, action) !== null
const admin: Need = (ctx) => ctx.isSuperAdmin
const hrOrAdmin: Need = (ctx) => ctx.isSuperAdmin || ctx.scope('leave_balance', 'edit') === 'any'
const seesOthersLeave: Need = (ctx) => ctx.isSuperAdmin || ['sub', 'any'].includes(ctx.scope('leave', 'view') ?? '') || ['sub', 'any'].includes(ctx.scope('leave_balance', 'view') ?? '')

export type TabKey = 'today' | 'calendar' | 'customers' | 'briefing' | 'checkin' | 'leave' | 'messages' | 'team' | 'approvals' | 'people' | 'admin' | 'hub'

export interface TabDef {
  key: TabKey
  to: string
  labelKey: string
  icon: LucideIcon
  needs?: Need
}

export const TAB: Record<TabKey, TabDef> = {
  today: { key: 'today', to: '/today', labelKey: 'nav.today', icon: CalendarDays },
  calendar: { key: 'calendar', to: '/calendar', labelKey: 'nav.calendar', icon: CalendarIcon },
  customers: { key: 'customers', to: '/customers', labelKey: 'nav.customers', icon: Store },
  briefing: { key: 'briefing', to: '/team/customers', labelKey: 'nav.briefing', icon: Table2, needs: can('customer_briefing') },
  checkin: { key: 'checkin', to: '/check-in', labelKey: 'nav.checkIn', icon: MapPin },
  leave: { key: 'leave', to: '/leave', labelKey: 'nav.leave', icon: CalendarDays },
  messages: { key: 'messages', to: '/messages', labelKey: 'nav.messages', icon: MessagesSquare },
  team: { key: 'team', to: '/team', labelKey: 'nav.team', icon: UsersIcon },
  approvals: { key: 'approvals', to: '/approvals', labelKey: 'nav.approvals', icon: CheckSquare, needs: canApprove },
  people: { key: 'people', to: '/people', labelKey: 'nav.people', icon: UserRound },
  admin: { key: 'admin', to: '/admin', labelKey: 'nav.admin', icon: ShieldCheck },
  hub: { key: 'hub', to: '/menu', labelKey: 'nav.hub', icon: LayoutGrid },
}

const GROUP_TABS: Record<RoleGroup, TabKey[]> = {
  field: ['calendar', 'messages', 'checkin', 'briefing', 'hub'],
  manager: ['team', 'customers', 'checkin', 'approvals', 'hub'],
  hr: ['people', 'leave', 'checkin', 'approvals', 'hub'],
  office: ['today', 'customers', 'checkin', 'messages', 'hub'],
  admin: ['team', 'customers', 'checkin', 'admin', 'hub'],
}

/** The phone tab bar (and the top of the desktop sidebar) for a group, minus tabs the person can't use. */
export function tabsFor(group: RoleGroup, ctx: NavContext): TabDef[] {
  return GROUP_TABS[group].map((k) => TAB[k]).filter((t) => !t.needs || t.needs(ctx))
}

/** Where a group lands after sign-in: the Check In tab for salespeople (their main tab), else the first tab. */
export function homeFor(group: RoleGroup, ctx: NavContext): string {
  if (group === 'field') return '/check-in'
  return tabsFor(group, ctx)[0]?.to ?? '/check-in'
}

export type RowKey =
  | 'trips' | 'tripset' | 'plan' | 'calendar' | 'journey' | 'report' | 'messages' | 'customers' | 'leave' | 'daysoff'
  | 'team' | 'attendance' | 'reports' | 'logs' | 'briefing' | 'flexteam' | 'approvals'
  | 'allowances' | 'holidays' | 'users' | 'permissions' | 'org' | 'hours' | 'adminatt' | 'locations' | 'notifications' | 'translations' | 'settings' | 'sheetsync'

export interface RowDef {
  key: RowKey
  label: string
  sub: string
  to: string
  icon: LucideIcon
  /** Tailwind background for the icon tile. */
  tone: string
  needs?: Need
}

export const ROW: Record<RowKey, RowDef> = {
  trips: { key: 'trips', label: 'Sales trips', sub: 'Province trips, day by day', to: '/trips', icon: MapIcon, tone: 'bg-earth-500', needs: can('sales_trip') },
  tripset: { key: 'tripset', label: 'Sales trip settings', sub: 'Standard rates, rooms, notice, special allowance', to: '/settings/trips', icon: MapIcon, tone: 'bg-earth-500', needs: (ctx) => ctx.isSuperAdmin || ctx.scope('settings', 'edit') !== null },
  plan: { key: 'plan', label: 'Today’s plan', sub: 'Your stops, route and next customer', to: '/plan', icon: Route, tone: 'bg-brand-500', needs: can('plan') },
  calendar: { key: 'calendar', label: 'Calendar', sub: 'Tasks, appointments and follow-ups', to: '/calendar', icon: CalendarIcon, tone: 'bg-status-visiting' },
  journey: { key: 'journey', label: 'Journey history', sub: 'Past days’ routes and time on the road', to: '/footprints', icon: FootprintsIcon, tone: 'bg-earth-500', needs: can('footprints') },
  report: { key: 'report', label: 'My numbers', sub: 'Visits, orders and collections', to: '/report', icon: BarChart3, tone: 'bg-status-working' },
  messages: { key: 'messages', label: 'Messages', sub: 'Mentions, replies and your customers', to: '/messages', icon: MessagesSquare, tone: 'bg-brand-700' },
  customers: { key: 'customers', label: 'Customers', sub: 'Calls, notes and visits by customer', to: '/customers', icon: Store, tone: 'bg-status-working', needs: can('customer') },
  leave: { key: 'leave', label: 'My leave', sub: 'Requests, balance and attendance', to: '/leave', icon: CalendarDays, tone: 'bg-brand-500' },
  daysoff: { key: 'daysoff', label: 'My days off', sub: 'Flexible allowance this cycle', to: '/leave/days-off', icon: CalendarRange, tone: 'bg-status-visiting', needs: (ctx) => !!ctx.flexible },
  team: { key: 'team', label: 'Team map', sub: 'Status, map, routes and customers', to: '/fleet', icon: UsersIcon, tone: 'bg-brand-500', needs: can('team_map') },
  attendance: { key: 'attendance', label: 'Team attendance', sub: 'Daily, weekly and by cycle', to: '/fleet?tab=attendance', icon: CalendarCheck, tone: 'bg-status-working', needs: can('team_map') },
  reports: { key: 'reports', label: 'Team reports', sub: 'Visits, orders, effectiveness', to: '/fleet?tab=reports', icon: BarChart3, tone: 'bg-status-visiting', needs: can('team_map') },
  logs: { key: 'logs', label: 'Activity logs', sub: 'What happened, by person', to: '/fleet?tab=logs', icon: History, tone: 'bg-neutral-600', needs: can('team_map') },
  briefing: { key: 'briefing', label: 'Customer briefing', sub: 'Customers by province, last visit and who', to: '/team/customers', icon: Table2, tone: 'bg-status-visiting', needs: can('customer_briefing') },
  flexteam: { key: 'flexteam', label: 'Flexible days off', sub: 'Day off balance of people who travel', to: '/leave/flexible', icon: CalendarRange, tone: 'bg-status-visiting', needs: seesOthersLeave },
  approvals: { key: 'approvals', label: 'Approvals', sub: 'Leave, days off and sales trips waiting for you', to: '/approvals', icon: CheckSquare, tone: 'bg-status-warn', needs: canApprove },
  allowances: { key: 'allowances', label: 'Leave allowances', sub: 'Company default and each person’s allowance', to: '/admin/attendance?tab=allow', icon: Scale, tone: 'bg-status-visiting', needs: hrOrAdmin },
  holidays: { key: 'holidays', label: 'Public holidays', sub: 'Holidays and company days off', to: '/admin/attendance?tab=holiday', icon: CalendarRange, tone: 'bg-status-warn', needs: hrOrAdmin },
  users: { key: 'users', label: 'Users', sub: 'Users · Departments · Roles', to: '/users', icon: UsersIcon, tone: 'bg-status-visiting', needs: admin },
  permissions: { key: 'permissions', label: 'Permissions', sub: 'Who can do what, by role or person', to: '/settings/permissions', icon: ShieldCheck, tone: 'bg-brand-700', needs: can('role_permission', 'edit') },
  org: { key: 'org', label: 'Departments & roles', sub: 'Add or rename departments and roles', to: '/users?tab=departments', icon: Network, tone: 'bg-earth-500', needs: admin },
  hours: { key: 'hours', label: 'Working hours', sub: 'Hours & days · Rules', to: '/settings/working-hours', icon: Clock, tone: 'bg-brand-500', needs: admin },
  adminatt: { key: 'adminatt', label: 'Attendance', sub: 'Cycle · Allowance · Flexible · Holiday', to: '/admin/attendance', icon: CalendarCheck, tone: 'bg-status-working', needs: hrOrAdmin },
  locations: { key: 'locations', label: 'Geofence & rules', sub: 'Locations · Geofence · Thresholds', to: '/admin/geofence', icon: Building2, tone: 'bg-status-working', needs: admin },
  notifications: { key: 'notifications', label: 'Notifications', sub: 'Alerts sent to managers', to: '/notifications', icon: Bell, tone: 'bg-status-danger', needs: admin },
  translations: { key: 'translations', label: 'Translations', sub: 'English and Khmer text', to: '/translations', icon: Languages, tone: 'bg-brand-600', needs: admin },
  settings: { key: 'settings', label: 'System settings', sub: 'Company-wide options', to: '/settings', icon: Settings, tone: 'bg-neutral-600', needs: admin },
  sheetsync: { key: 'sheetsync', label: 'Data & sync', sub: 'Google Sheet sync and recent runs', to: '/admin/sync', icon: FileSpreadsheet, tone: 'bg-status-working', needs: admin },
}

const FOR_YOU: Record<RoleGroup, RowKey[]> = {
  field: ['plan', 'leave', 'report', 'customers', 'journey', 'trips'],
  manager: ['attendance', 'briefing', 'flexteam', 'reports', 'trips', 'logs'],
  hr: ['allowances', 'holidays', 'flexteam', 'attendance', 'users', 'leave'],
  office: ['calendar', 'customers', 'team', 'leave', 'messages', 'journey'],
  admin: ['users', 'permissions', 'hours', 'notifications', 'locations', 'sheetsync'],
}

const allowed = (ctx: NavContext) => (r: RowDef) => !r.needs || r.needs(ctx)

/**
 * The Hub, grouped by function (canvas: "Hub redesign"): one card per
 * function, each opening a page split into parts (Mine / Your team /
 * Company...). Every screen the person can use appears in exactly one
 * function; nothing that is already one of their tabs is repeated.
 */
export type FnKey = 'sell' | 'day' | 'time' | 'team' | 'company'
export type PartKey = 'mine' | 'team' | 'company' | 'people' | 'rules' | 'system'

export interface FnDef {
  key: FnKey
  /** i18n key for the title. */
  titleKey: string
  title: string
  icon: LucideIcon
  tone: string
}

export const FN: Record<FnKey, FnDef> = {
  sell: { key: 'sell', titleKey: 'nav.hubSell', title: 'Customers & sales', icon: Store, tone: 'bg-status-working' },
  day: { key: 'day', titleKey: 'nav.hubDay', title: 'My day', icon: CalendarIcon, tone: 'bg-status-visiting' },
  time: { key: 'time', titleKey: 'nav.hubTime', title: 'Leave & days off', icon: CalendarDays, tone: 'bg-brand-500' },
  team: { key: 'team', titleKey: 'nav.hubTeam', title: 'Team', icon: UsersIcon, tone: 'bg-earth-500' },
  company: { key: 'company', titleKey: 'nav.hubCompany', title: 'Company setup', icon: ShieldCheck, tone: 'bg-brand-700' },
}

export const PART_TITLE: Record<PartKey, string> = { mine: 'Mine', team: 'Your team', company: 'Company', people: 'People & access', rules: 'Work rules', system: 'System' }

/** Where each screen lives: function, then part. Order here is the order inside a function. */
const ROW_FN: [RowKey, FnKey, PartKey][] = [
  ['customers', 'sell', 'mine'], ['plan', 'sell', 'mine'], ['trips', 'sell', 'mine'], ['briefing', 'sell', 'team'],
  ['calendar', 'day', 'mine'], ['messages', 'day', 'mine'], ['journey', 'day', 'mine'], ['report', 'day', 'mine'],
  ['leave', 'time', 'mine'], ['daysoff', 'time', 'mine'], ['approvals', 'time', 'team'], ['flexteam', 'time', 'team'], ['allowances', 'time', 'company'], ['holidays', 'time', 'company'],
  ['team', 'team', 'team'], ['attendance', 'team', 'team'], ['reports', 'team', 'team'], ['logs', 'team', 'team'],
  ['users', 'company', 'people'], ['permissions', 'company', 'people'], ['org', 'company', 'people'],
  ['hours', 'company', 'rules'], ['adminatt', 'company', 'rules'], ['locations', 'company', 'rules'], ['tripset', 'company', 'rules'],
  ['notifications', 'company', 'system'], ['translations', 'company', 'system'], ['settings', 'company', 'system'], ['sheetsync', 'company', 'system'],
]

/** Which functions come first for each group. */
const FN_ORDER: Record<RoleGroup, FnKey[]> = {
  field: ['sell', 'day', 'time', 'team', 'company'],
  manager: ['team', 'sell', 'time', 'day', 'company'],
  hr: ['time', 'team', 'day', 'sell', 'company'],
  office: ['day', 'team', 'time', 'sell', 'company'],
  admin: ['company', 'team', 'time', 'sell', 'day'],
}

export interface HubFunction extends FnDef {
  rows: RowDef[]
  parts: { key: PartKey; title: string; rows: RowDef[] }[]
}

/** The Hub cards for a group: every screen the person can use, minus their tabs, by function; empty functions dropped. */
export function hubFunctions(group: RoleGroup, ctx: NavContext): HubFunction[] {
  const tabRoutes = new Set(tabsFor(group, ctx).map((t) => t.to))
  const ok = (k: RowKey) => allowed(ctx)(ROW[k]) && !tabRoutes.has(ROW[k].to)
  return FN_ORDER[group]
    .map((f) => {
      const here = ROW_FN.filter(([k, fn]) => fn === f && ok(k))
      const partKeys = [...new Set(here.map(([, , p]) => p))]
      return {
        ...FN[f],
        rows: here.map(([k]) => ROW[k]),
        parts: partKeys.map((p) => ({ key: p, title: PART_TITLE[p], rows: here.filter(([, , q]) => q === p).map(([k]) => ROW[k]) })),
      }
    })
    .filter((f) => f.rows.length > 0)
}

/** The function a screen lives in, for its back link (/menu/:fn); undefined for screens outside the Hub. */
export function fnForPath(pathname: string): FnKey | undefined {
  return ROW_FN.find(([k]) => ROW[k].to === pathname)?.[1]
}

/** Hub search: screens whose name or description matches, with the function they live in. */
export function hubSearch(group: RoleGroup, ctx: NavContext, query: string): (RowDef & { fn: FnDef })[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return hubFunctions(group, ctx).flatMap((f) => f.rows.filter((r) => r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)).map((r) => ({ ...r, fn: FN[f.key] })))
}

/** Admin tab: the Administration rows the person can use. */
export const ADMIN_ROWS: RowKey[] = ['users', 'permissions', 'hours', 'adminatt', 'locations', 'sheetsync', 'tripset', 'translations', 'settings', 'notifications']

/** Hub "For you": up to four shortcuts for the group. */
export function forYou(group: RoleGroup, ctx: NavContext): RowDef[] {
  const rows = FOR_YOU[group].map((k) => ROW[k]).filter(allowed(ctx))
  // Full rows of three tiles, as on the canvas: top up a short row with the
  // person's next screens from the Hub, or drop the stragglers if there are none.
  const extra = hubFunctions(group, ctx)
    .flatMap((f) => f.rows)
    .filter((r) => !rows.some((x) => x.key === r.key))
  while (rows.length % 3 && extra.length) rows.push(extra.shift()!)
  return rows.length > 3 ? rows.slice(0, rows.length - (rows.length % 3)) : rows
}

/** Shorter names for a function's one-line summary in the Hub (falls back to the label). */
const SHORT: Partial<Record<RowKey, string>> = {
  attendance: 'Attendance',
  reports: 'Reports',
  logs: 'Logs',
  briefing: 'Briefing',
  flexteam: 'Flexible days off',
  allowances: 'Allowances',
  holidays: 'Holidays',
  org: 'Departments',
  hours: 'Hours',
  adminatt: 'Attendance',
  locations: 'Geofence',
  sheetsync: 'Sync',
  settings: 'System',
  journey: 'Journey history',
  tripset: 'Trip settings',
}
export const shortLabel = (r: RowDef) => SHORT[r.key] ?? r.label

/** Every Admin-tab row the person can use. */
export function adminRows(ctx: NavContext): RowDef[] {
  return ADMIN_ROWS.map((k) => ROW[k]).filter(allowed(ctx))
}

