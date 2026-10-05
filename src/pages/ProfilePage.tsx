import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Building2,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  Crosshair,
  Download,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Pencil,
  Phone,
  Send,
  Settings,
  Smartphone,
  Store,
  Tag,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/auth/AvatarPicker'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { usersService } from '@/features/users/usersService'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { leaveService } from '@/features/leave/leaveService'
import type { LeaveBalanceSummary } from '@/features/leave/types'
import { useLocations } from '@/features/locations/useLocations'
import { scheduleService } from '@/features/schedule/scheduleService'
import { commonHours, workingDaysLabel } from '@/features/schedule/schedule'
import { customerBookService } from '@/features/customers/customerBookService'
import { pushService, type PushPermissionState } from '@/features/notifications/pushService'
import { useCan } from '@/features/permissions/PermissionsContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { useTheme } from '@/lib/ThemeContext'
import type { ThemeMode } from '@/lib/theme'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { supabase } from '@/lib/supabase'
import { formatDate, formatTime } from '@/lib/datetime'
import { displayName } from '@/lib/displayName'
import { haptic } from '@/lib/haptic'

type Profile = NonNullable<ReturnType<typeof useProfile>['profile']>

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/**
 * The signed-in person's own page, laid out like the design canvas
 * (Polish › Profile): a personal card, contact details, a row of "my work"
 * tiles (manager, work location, hours, customers), leave left this year,
 * settings, account & security, then sign out.
 */
export function ProfilePage() {
  const { profile, loading, refresh } = useProfile()
  const { session } = useAuth()
  const { t } = useLanguage()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      {loading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-neutral-100" />
      ) : profile && session ? (
        <>
          <ProfileHero profile={profile} userId={session.user.id} onUpdated={refresh} />
          <ContactList profile={profile} userId={session.user.id} onUpdated={refresh} />
          <MyWork profile={profile} userId={session.user.id} />
          <LeaveLeft userId={session.user.id} />
          <SettingsCard profile={profile} />
          <AccountCard />
          <button
            onClick={() => {
              haptic('light')
              setLogoutConfirmOpen(true)
            }}
            className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-neutral-100 bg-white text-[15px] font-extrabold text-status-danger tap-target"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            {t('profile.signOut')}
          </button>
          <p className="-mt-0.5 text-center text-[11px] text-neutral-500">{t('profile.versionLine', { version: __APP_VERSION__, build: __BUILD_NUMBER__ })}</p>
        </>
      ) : (
        <p className="text-sm text-neutral-500">{t('profile.couldNotLoad')}</p>
      )}

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}

function ProfileHero({ profile, userId, onUpdated }: { profile: Profile; userId: string; onUpdated: () => void }) {
  const { t } = useLanguage()
  const { attendance, openAttendance } = useJourneyContext()
  const name = displayName(profile.full_name, profile.nickname)
  const working = attendance === 'CLOCKED_IN' && openAttendance
  const roleLine = [profile.role_name, profile.position].filter(Boolean).join(' · ')

  return (
    <section aria-label={name} className="flex flex-col items-center pb-1 pt-2 text-center">
      <AvatarPicker userId={userId} photoPath={profile.photo_path} onUploaded={onUpdated} initials={initialsOf(name)} large />
      <h1 className="mt-4 text-2xl font-extrabold leading-[30px] text-neutral-900">{name}</h1>
      {roleLine && <p className="mt-0.5 text-sm text-neutral-500">{roleLine}</p>}
      <span
        className={`mt-2.5 inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${
          working ? 'bg-status-working/10 text-status-working' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${working ? 'bg-status-working' : 'border-2 border-neutral-400'}`} />
        {working ? t('profile.workingSince', { time: formatTime(openAttendance.clock_in_at) }) : t('profile.offShift')}
      </span>
    </section>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[18px] border border-neutral-100 bg-white px-3.5 shadow-card">{children}</div>
}

function SectionTitle({ children, to, toLabel }: { children: ReactNode; to?: string; toLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-0.5 pt-1.5">
      <h2 className="text-[17px] font-extrabold text-neutral-900">{children}</h2>
      {to && (
        <Link to={to} aria-label={toLabel} className="flex h-8 w-8 items-center justify-end text-neutral-500">
          <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
        </Link>
      )}
    </div>
  )
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-neutral-200 text-neutral-900">
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  )
}

const ROW = 'flex min-h-[58px] items-center gap-3 border-t border-neutral-100 py-2 first:border-t-0'

/** One row of the contact and account cards: icon, optional caption over a label, an optional value on the right, a chevron when it goes somewhere. */
function Row({
  icon,
  caption,
  label,
  value,
  valueClass = 'text-neutral-500',
  to,
  href,
}: {
  icon: LucideIcon
  caption?: string
  label: string
  value?: string
  valueClass?: string
  to?: string
  href?: string
}) {
  const inner = (
    <>
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        {caption && <span className="block text-xs text-neutral-500">{caption}</span>}
        <span className="block truncate text-[15px] font-semibold text-neutral-900">{label}</span>
      </span>
      {value && <span className={`shrink-0 text-[13px] font-bold ${valueClass}`}>{value}</span>}
      {(to || href) && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />}
    </>
  )
  if (to)
    return (
      <Link to={to} className={ROW}>
        {inner}
      </Link>
    )
  if (href)
    return (
      <a href={href} className={ROW}>
        {inner}
      </a>
    )
  return <div className={ROW}>{inner}</div>
}

function ContactList({ profile, userId, onUpdated }: { profile: Profile; userId: string; onUpdated: () => void }) {
  const { t } = useLanguage()
  return (
    <Card>
      <Row icon={Phone} caption={t('profile.phone')} label={profile.phone_primary || '—'} />
      <Row icon={Mail} caption={t('profile.email')} label={profile.email || '—'} />
      <NicknameRow userId={userId} nickname={profile.nickname} onSaved={onUpdated} />
      {profile.employment_date && <Row icon={CalendarCheck} caption={t('profile.employedSince')} label={formatDate(profile.employment_date)} />}
    </Card>
  )
}

/** Self-service nickname edit: shown instead of the full name everywhere in the app once set (see displayName). A direct table write under users_update's own-row RLS -- see usersService.updateOwnNickname. */
function NicknameRow({ userId, nickname, onSaved }: { userId: string; nickname: string | null; onSaved: () => void }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await usersService.updateOwnNickname(userId, value.trim() || null)
      haptic('success')
      onSaved()
      setEditing(false)
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : t('profile.nicknameSaveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={ROW}>
      <IconTile icon={Tag} />
      {editing ? (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('profile.nicknamePlaceholder')}
              aria-label={t('profile.nickname')}
              className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-neutral-300 bg-white px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:bg-neutral-950"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Save nickname"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-working/10 text-status-working tap-target disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              aria-label={t('common.cancel')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 tap-target disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-status-danger">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => {
            setValue(nickname ?? '')
            setError(null)
            setEditing(true)
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left tap-target"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-neutral-500">{t('profile.nickname')}</span>
            <span className="block truncate text-[15px] font-semibold text-neutral-900">{nickname || t('common.notSet')}</span>
          </span>
          <Pencil className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        </button>
      )}
    </div>
  )
}

interface WorkFacts {
  manager: { name: string; phone: string | null } | null
  hours: string | null
  customers: { total: number; due: number } | null
}

/** Manager, team hours and the customer count behind the "My work" tiles -- each loads on its own and simply stays blank if it fails. */
function useWorkFacts(profile: Profile, userId: string, withCustomers: boolean): WorkFacts {
  const [facts, setFacts] = useState<WorkFacts>({ manager: null, hours: null, customers: null })
  useEffect(() => {
    let cancelled = false
    const set = (patch: Partial<WorkFacts>) => !cancelled && setFacts((f) => ({ ...f, ...patch }))
    if (profile.manager_id) {
      supabase
        .from('user_directory')
        .select('full_name, nickname, phone_primary')
        .eq('id', profile.manager_id)
        .maybeSingle()
        .then(({ data }) => data?.full_name && set({ manager: { name: displayName(data.full_name, data.nickname), phone: data.phone_primary } }))
    }
    scheduleService
      .list()
      .then((all) => {
        const mine = all.find((s) => s.departmentId === profile.department_id) ?? all.find((s) => s.departmentId === null)
        if (!mine) return
        const common = commonHours(mine.days)
        set({ hours: [workingDaysLabel(mine.days), common ? `${common.start}–${common.end}` : null].filter(Boolean).join(' · ') })
      })
      .catch(() => {})
    if (withCustomers) {
      customerBookService
        .summary({ owner: userId })
        .then((rows) =>
          set({
            customers: {
              total: rows.reduce((n, r) => n + r.n, 0),
              due: rows.filter((r) => r.bucket === '31-60' || r.bucket === '60+' || r.bucket === 'never').reduce((n, r) => n + r.n, 0),
            },
          })
        )
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [profile.manager_id, profile.department_id, userId, withCustomers])
  return facts
}

function MyWork({ profile, userId }: { profile: Profile; userId: string }) {
  const { t } = useLanguage()
  const canCustomers = useCan('customers')
  const { openAttendance } = useJourneyContext()
  const { locations } = useLocations()
  const facts = useWorkFacts(profile, userId, canCustomers)

  // Where they work: today's clock-in location if it matched one, else the company's location(s).
  const active = locations.filter((l) => l.active)
  const todays = openAttendance?.clock_in_location_id ? locations.find((l) => l.id === openAttendance.clock_in_location_id) : undefined
  const place = todays?.name ?? (active.length === 1 ? active[0].name : active.length > 1 ? t('profile.locationsCount', { n: active.length }) : null)

  const tiles: { icon: LucideIcon; label: string; sub: string; subClass?: string; to?: string; href?: string }[] = [
    { icon: UserCheck, label: t('profile.manager'), sub: facts.manager?.name ?? t('common.notSet'), href: facts.manager?.phone ? `tel:${facts.manager.phone}` : undefined },
    { icon: Building2, label: t('profile.workLocation'), sub: place ?? '—' },
    { icon: Clock, label: t('profile.hours'), sub: facts.hours ?? '—' },
  ]
  if (canCustomers)
    tiles.push({
      icon: Store,
      label: t('nav.customers'),
      sub: facts.customers ? (facts.customers.due ? t('profile.customersDue', { n: facts.customers.total, due: facts.customers.due }) : String(facts.customers.total)) : '—',
      subClass: facts.customers?.due ? 'text-status-warn' : undefined,
      to: '/customers',
    })

  const tileClass = 'flex w-32 shrink-0 snap-start flex-col gap-[22px] rounded-[18px] border border-neutral-100 bg-white px-3 py-3.5 shadow-card'
  return (
    <>
      <SectionTitle>{t('profile.myWork')}</SectionTitle>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        {tiles.map((w) => {
          const inner = (
            <>
              <IconTile icon={w.icon} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-neutral-900">{w.label}</span>
                <span className={`mt-0.5 line-clamp-2 block text-xs ${w.subClass ?? 'text-neutral-500'}`}>{w.sub}</span>
              </span>
            </>
          )
          return w.to ? (
            <Link key={w.label} to={w.to} className={tileClass}>
              {inner}
            </Link>
          ) : w.href ? (
            <a key={w.label} href={w.href} className={tileClass}>
              {inner}
            </a>
          ) : (
            <div key={w.label} className={tileClass}>
              {inner}
            </div>
          )
        })}
      </div>
    </>
  )
}

const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n === Math.floor(n) + 0.5 ? `${Math.floor(n) || ''}½` : n.toFixed(1))

function LeaveLeft({ userId }: { userId: string }) {
  const { t } = useLanguage()
  const [rows, setRows] = useState<LeaveBalanceSummary[] | null>(null)
  const [pending, setPending] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    leaveService
      .listBalances(new Date().getFullYear())
      .then((all) => !cancelled && setRows(all.filter((r) => r.user_id === userId && (r.leave_type === 'annual' || r.leave_type === 'sick'))))
      .catch(() => !cancelled && setRows([]))
    leaveService
      .listRequests()
      .then((reqs) => {
        if (cancelled) return
        const byType: Record<string, number> = {}
        for (const r of reqs) if (r.user_id === userId && r.status === 'pending') byType[r.leave_type] = (byType[r.leave_type] ?? 0) + (r.days ?? 0)
        setPending(byType)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  const label = (type: string | null) => (type === 'annual' ? t('profile.annual') : t('profile.sick'))
  return (
    <>
      <SectionTitle to="/leave" toLabel={t('profile.seeAll')}>
        {t('profile.leaveLeft')}
      </SectionTitle>
      {rows === null ? (
        <div className="h-[104px] animate-pulse rounded-[18px] bg-neutral-100" />
      ) : rows.length === 0 ? (
        <Card>
          <p className="py-4 text-sm text-neutral-500">{t('profile.noLeaveYet')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((r) => {
            const quota = r.quota_days ?? 0
            const left = r.remaining_days ?? 0
            const pct = quota > 0 ? Math.max(0, Math.min(100, (left / quota) * 100)) : 0
            const waiting = pending[r.leave_type ?? ''] ?? 0
            return (
              <Link key={r.leave_type} to="/leave" className="rounded-[18px] border border-neutral-100 bg-white px-3 py-3.5 shadow-card">
                <span className="block text-[13px] font-semibold text-neutral-500">{label(r.leave_type)}</span>
                <span className="mt-1 block text-2xl font-extrabold leading-7 text-neutral-900">
                  {fmtDays(left)}
                  <span className="text-[13px] font-semibold text-neutral-500">{t('profile.ofDays', { total: fmtDays(quota) })}</span>
                </span>
                <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <span className={`block h-full rounded-full ${r.leave_type === 'annual' ? 'bg-brand-500' : 'bg-status-working'}`} style={{ width: `${pct}%` }} />
                </span>
                <span className={`mt-1.5 block text-[11px] ${waiting ? 'text-status-warn' : 'text-neutral-500'}`}>
                  {waiting ? t('profile.daysWaiting', { n: fmtDays(waiting) }) : t('profile.usedDays', { n: fmtDays(r.used_days ?? 0) })}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-[10px] bg-neutral-100 p-[3px]">
      {options.map(([k, text]) => {
        const on = k === value
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              haptic('light')
              onChange(k)
            }}
            className={`h-[30px] whitespace-nowrap rounded-lg px-2.5 text-xs ${on ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}

function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-status-working' : 'bg-neutral-300'}`}
    >
      <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-[#ffffff] shadow transition-[left] ${on ? 'left-[23px]' : 'left-[3px]'}`} />
    </button>
  )
}

/** This device's Web Push subscription as a switch -- hidden where the browser can't do push at all. */
function PushRow() {
  const { t } = useLanguage()
  const [state, setState] = useState<PushPermissionState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    pushService
      .getState()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState('unsupported'))
    return () => {
      cancelled = true
    }
  }, [])

  if (state === null || state === 'unsupported') return null
  const on = state === 'subscribed'

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (on) await pushService.unsubscribe()
      else await pushService.subscribe()
      haptic('success')
      setState(await pushService.getState())
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : t('profile.pushError'))
      setState(await pushService.getState().catch(() => state))
    } finally {
      setBusy(false)
    }
  }

  const sub = state === 'denied' ? t('profile.pushBlocked') : on ? t('profile.pushOn') : t('profile.pushOff')
  return (
    <div className={ROW}>
      <IconTile icon={Bell} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-neutral-900">{t('profile.pushTitle')}</span>
        <span className={`block text-xs ${error ? 'text-status-danger' : 'text-neutral-500'}`}>{error ?? sub}</span>
      </span>
      {busy ? <Loader2 className="h-5 w-5 animate-spin text-neutral-500" /> : <Switch on={on} label={t('profile.pushTitle')} disabled={state === 'denied'} onToggle={toggle} />}
    </div>
  )
}

function SettingsCard({ profile }: { profile: Profile }) {
  const { t, language, setLanguage } = useLanguage()
  const { mode, setMode } = useTheme()
  const install = useInstallPrompt()
  return (
    <>
      <SectionTitle>{t('profile.settingsTitle')}</SectionTitle>
      <Card>
        <div className={ROW}>
          <IconTile icon={Globe} />
          <span className="flex-1 text-[15px] font-semibold text-neutral-900">{t('profile.language')}</span>
          <Segmented
            label={t('profile.language')}
            value={language}
            options={[
              ['en', 'English'],
              ['km', 'ខ្មែរ'],
            ]}
            onChange={(c) => setLanguage(c as 'en' | 'km')}
          />
        </div>
        <div className={ROW}>
          <IconTile icon={Moon} />
          <span className="flex-1 text-[15px] font-semibold text-neutral-900">{t('profile.theme')}</span>
          <Segmented
            label={t('profile.theme')}
            value={mode}
            options={[
              ['light', t('profile.themeLight')],
              ['dark', t('profile.themeDark')],
              ['system', t('profile.themeAuto')],
            ]}
            onChange={(m) => setMode(m as ThemeMode)}
          />
        </div>
        <PushRow />
        {/* Telegram is linked by an admin (Users › edit), so this shows the state rather than a switch. */}
        <div className={ROW}>
          <IconTile icon={Send} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-neutral-900">{t('profile.telegramTitle')}</span>
            <span className="block text-xs text-neutral-500">{profile.telegram_id ? t('profile.telegramOn') : t('profile.telegramOff')}</span>
          </span>
          <span
            className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${
              profile.telegram_id ? 'bg-status-working/10 text-status-working' : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {profile.telegram_id ? t('profile.connected') : t('profile.notConnected')}
          </span>
        </div>
        {(install.canInstall || install.needsIosInstructions) && (
          <button
            type="button"
            disabled={!install.canInstall}
            onClick={() => {
              haptic('light')
              install.promptInstall()
            }}
            className={`${ROW} w-full text-left`}
          >
            <IconTile icon={Download} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-neutral-900">{t('profile.installApp')}</span>
              {install.needsIosInstructions && <span className="block text-xs text-neutral-500">{t('profile.installIosHint')}</span>}
            </span>
            {install.canInstall && <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />}
          </button>
        )}
        <Row icon={Settings} label={t('profile.moreSettings')} to="/settings" />
      </Card>
    </>
  )
}

/** "iPhone", "Android phone"… from the user agent -- enough to tell which device this session is on. */
function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  const android = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/)
  if (android) return android[1].trim()
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Browser'
}

function useLocationPermission(): PermissionState | null {
  const [state, setState] = useState<PermissionState | null>(null)
  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = () => status && setState(status.state)
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        status = s
        update()
        s.addEventListener('change', update)
      })
      .catch(() => {})
    return () => status?.removeEventListener('change', update)
  }, [])
  return state
}

function AccountCard() {
  const { t } = useLanguage()
  const location = useLocationPermission()
  const locationText =
    location === 'granted' ? t('profile.locationAllowed') : location === 'denied' ? t('profile.locationBlocked') : location === 'prompt' ? t('profile.locationAsk') : undefined
  const locationClass = location === 'granted' ? 'text-status-working' : location === 'denied' ? 'text-status-danger' : 'text-neutral-500'
  return (
    <>
      <SectionTitle>{t('profile.accountSecurity')}</SectionTitle>
      <Card>
        <Row icon={KeyRound} label={t('profile.changePassword')} to="/reset-password" />
        <Row icon={Smartphone} label={t('profile.thisPhone')} value={deviceLabel()} />
        <Row icon={Crosshair} label={t('profile.locationAccess')} value={locationText} valueClass={locationClass} />
      </Card>
    </>
  )
}
