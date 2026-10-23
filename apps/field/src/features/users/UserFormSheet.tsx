import { useEffect, useState, type ReactNode } from 'react'
import { SegmentedControl } from '@footprints/shared/components/SegmentedControl'
import { KeyRound, Send, Sheet, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { displayName } from '@footprints/shared/lib/displayName'
import { haptic } from '@footprints/shared/lib/haptic'
import { generateSuggestedPassword, PasswordBox } from '@footprints/shared/features/users/PasswordBox'
import { usersService, type ManagedUser, type Option, type UserStatus } from '@footprints/shared/features/users/usersService'
import { formatSheetIds, parseSheetIds } from '@footprints/shared/features/users/sheetIds'
import { flexService, type DayOffMode, type DayOffModeInfo } from '@/features/flex/flexService'
import { dayDate, rate, shortDate } from '@/features/flex/flex'
import { scheduleService, type UserClockWindow } from '@/features/schedule/scheduleService'
import { Stepper } from '@/components/Stepper'

const STATUSES: UserStatus[] = ['active', 'suspended', 'discharged']
const MIN_PASSWORD_LENGTH = 8

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  user: ManagedUser | null
  users: ManagedUser[]
  roles: Option[]
  departments: Option[]
  onClose: () => void
  onSaved: () => void
}

/** Create-or-edit form for a single user, shared because the two only differ in a handful of fields (email/password are create-only; status/generate-password are edit-only). */
export function UserFormSheet({ open, mode, user, users, roles, departments, onClose, onSaved }: Props) {
  const { profile } = useProfile()
  const isSuperAdmin = profile?.is_super_admin === true
  const userId = user?.id
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phonePrimary, setPhonePrimary] = useState('')
  const [position, setPosition] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [isFieldSales, setIsFieldSales] = useState(false)
  // Daily order target in USD as typed; empty = the company default.
  const [orderTarget, setOrderTarget] = useState('')
  const [status, setStatus] = useState<UserStatus>('active')
  const [suspendedFrom, setSuspendedFrom] = useState('')
  const [suspendedTo, setSuspendedTo] = useState('')
  const [dischargedDate, setDischargedDate] = useState('')
  // Days off rule (0100): company schedule or flexible (travel), changed
  // from the next attendance cycle unless "start this cycle" is ticked.
  const [modeInfo, setModeInfo] = useState<DayOffModeInfo | null>(null)
  const [dayOffMode, setDayOffMode] = useState<DayOffMode>('company')
  const [thisCycle, setThisCycle] = useState(false)
  const [rates, setRates] = useState({ sat: 0.5, sun: 1 })
  // Clock-in window (0109): this person's own early clock-in / auto
  // clock-out minutes, null = the company setting.
  const [clockWindow, setClockWindow] = useState<UserClockWindow | null>(null)
  const [earlyMinutes, setEarlyMinutes] = useState<number | null>(null)
  const [graceMinutes, setGraceMinutes] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The "Generate New Password" box (edit mode only) is opt-in and separate
  // from the main Save action -- setting a password takes effect the
  // moment it's confirmed, unlike the other fields which wait for Save.
  const [showPasswordBox, setShowPasswordBox] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [passwordSet, setPasswordSet] = useState(false)

  // Telegram ID: super-admin-only (usersService.setTelegramId enforces this
  // server-side too), and its own immediately-effective action like the
  // password box above, not bundled into the main field-by-field Save.
  const [telegramId, setTelegramId] = useState('')
  const [settingTelegramId, setSettingTelegramId] = useState(false)
  const [telegramIdSet, setTelegramIdSet] = useState(false)
  const [telegramError, setTelegramError] = useState<string | null>(null)

  // Google Sheet IDs: super-admin-only like the Telegram ID, and likewise its own
  // immediately-effective action. They are what the sheet sync uses to link this
  // person's customers and orders to them (see sheet_ids in the sync function).
  const [sheetIdsText, setSheetIdsText] = useState('')
  const [sheetIdsLoading, setSheetIdsLoading] = useState(false)
  const [savingSheetIds, setSavingSheetIds] = useState(false)
  const [sheetIdsSaved, setSheetIdsSaved] = useState(false)
  const [sheetIdsError, setSheetIdsError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setFullName(mode === 'edit' && user ? user.fullName : '')
    setNickname((mode === 'edit' && user?.nickname) || '')
    setEmail('')
    setPassword(mode === 'create' ? generateSuggestedPassword() : '')
    setPhonePrimary((mode === 'edit' && user?.phonePrimary) || '')
    setPosition((mode === 'edit' && user?.position) || '')
    setDepartmentId((mode === 'edit' && user?.departmentId) || '')
    setManagerId((mode === 'edit' && user?.managerId) || '')
    setRoleId((mode === 'edit' && user?.roleId) || '')
    setIsFieldSales(mode === 'edit' && user ? user.isFieldSales : false)
    setStatus(mode === 'edit' && user ? user.status : 'active')
    setOrderTarget('')
    if (mode === 'edit' && user) {
      usersService
        .orderTarget(user.id)
        .then((t) => setOrderTarget(t == null ? '' : String(t)))
        .catch(() => {})
    }
    setSuspendedFrom('')
    setSuspendedTo('')
    setDischargedDate('')
    setShowPasswordBox(false)
    setNewPassword('')
    setPasswordSet(false)
    setTelegramId((mode === 'edit' && user?.telegramId) || '')
    setTelegramIdSet(false)
    setTelegramError(null)
    setSheetIdsText('')
    setSheetIdsSaved(false)
    setSheetIdsError(null)
    setModeInfo(null)
    setDayOffMode('company')
    setThisCycle(false)
    setClockWindow(null)
    setEarlyMinutes(null)
    setGraceMinutes(null)
    if (mode === 'edit' && user) {
      scheduleService
        .userClockWindow(user.id)
        .then((w) => {
          setClockWindow(w)
          setEarlyMinutes(w?.allowEarlyClockinMinutes ?? null)
          setGraceMinutes(w?.autoClockoutGraceMinutes ?? null)
        })
        .catch(() => setClockWindow(null))
      flexService
        .modeInfo(user.id)
        .then((info) => {
          setModeInfo(info)
          if (info) setDayOffMode(info.nextMode ?? info.mode)
        })
        .catch(() => setModeInfo(null))
      flexService
        .settings()
        .then((st) => setRates({ sat: st.satRate, sun: st.sunRate }))
        .catch(() => {})
    }
  }, [open, mode, user])

  const modeChanges = !!modeInfo && (dayOffMode !== (modeInfo.nextMode ?? modeInfo.mode) || (thisCycle && dayOffMode !== modeInfo.mode))
  const clockWindowChanges =
    !!clockWindow && (earlyMinutes !== clockWindow.allowEarlyClockinMinutes || graceMinutes !== clockWindow.autoClockoutGraceMinutes)

  const statusNeedsMoreInput =
    (status === 'suspended' && (!suspendedFrom || !suspendedTo)) || (status === 'discharged' && !dischargedDate)
  const canSave =
    fullName.trim() &&
    roleId &&
    (mode === 'edit' || (email.trim() && password.length >= MIN_PASSWORD_LENGTH)) &&
    !statusNeedsMoreInput

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        await usersService.create({
          fullName: fullName.trim(),
          nickname: nickname.trim() || null,
          email: email.trim(),
          password,
          roleId,
          phonePrimary: phonePrimary.trim() || null,
          position: position.trim() || null,
          departmentId: departmentId || null,
          managerId: managerId || null,
          isFieldSales,
        })
        haptic('success')
        onSaved()
        onClose()
      } else if (user) {
        await usersService.update(user.id, {
          fullName: fullName.trim(),
          nickname: nickname.trim() || null,
          phonePrimary: phonePrimary.trim() || null,
          position: position.trim() || null,
          departmentId: departmentId || null,
          managerId: managerId || null,
          roleId: roleId || null,
          status,
          isFieldSales,
          dailyOrderTargetUsd: orderTarget.trim() === '' ? null : Math.max(0, Number(orderTarget) || 0),
          suspendedFrom: suspendedFrom || null,
          suspendedTo: suspendedTo || null,
          dischargedDate: dischargedDate || null,
        })
        if (modeChanges) await flexService.setMode(user.id, dayOffMode, thisCycle && dayOffMode !== modeInfo?.mode)
        if (clockWindowChanges) await scheduleService.setUserClockWindow(user.id, earlyMinutes, graceMinutes)
        haptic('success')
        onSaved()
        onClose()
      }
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  function openPasswordBox() {
    setNewPassword(generateSuggestedPassword())
    setPasswordSet(false)
    setError(null)
    setShowPasswordBox(true)
  }

  async function handleSetPassword() {
    if (!user || newPassword.length < MIN_PASSWORD_LENGTH || settingPassword) return
    setSettingPassword(true)
    setError(null)
    try {
      await usersService.resetPassword(user.id, newPassword)
      haptic('success')
      onSaved()
      setPasswordSet(true)
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Failed to set the new password.')
    } finally {
      setSettingPassword(false)
    }
  }

  useEffect(() => {
    if (!open || mode !== 'edit' || !userId || !isSuperAdmin) return
    let cancelled = false
    setSheetIdsLoading(true)
    usersService
      .sheetIds(userId)
      .then((ids) => {
        if (!cancelled) setSheetIdsText(formatSheetIds(ids))
      })
      .catch((e) => {
        if (!cancelled) setSheetIdsError(e instanceof Error ? e.message : 'Couldn’t load the Google Sheet IDs.')
      })
      .finally(() => {
        if (!cancelled) setSheetIdsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, mode, userId, isSuperAdmin])

  async function handleSetSheetIds() {
    if (!user || savingSheetIds) return
    setSavingSheetIds(true)
    setSheetIdsError(null)
    try {
      const ids = parseSheetIds(sheetIdsText)
      await usersService.setSheetIds(user.id, ids)
      setSheetIdsText(formatSheetIds(ids))
      haptic('success')
      setSheetIdsSaved(true)
    } catch (e) {
      haptic('error')
      setSheetIdsError(e instanceof Error ? e.message : 'Failed to save the Google Sheet IDs.')
    } finally {
      setSavingSheetIds(false)
    }
  }

  async function handleSetTelegramId() {
    if (!user || settingTelegramId) return
    setSettingTelegramId(true)
    setTelegramError(null)
    try {
      await usersService.setTelegramId(user.id, telegramId.trim() || null)
      haptic('success')
      onSaved()
      setTelegramIdSet(true)
    } catch (e) {
      haptic('error')
      setTelegramError(e instanceof Error ? e.message : 'Failed to set the Telegram ID.')
    } finally {
      setSettingTelegramId(false)
    }
  }

  const managerOptions = users.filter((u) => u.id !== user?.id)

  return (
    <BottomSheet side open={open} onClose={onClose} title={mode === 'create' ? 'New User' : 'Edit User'}>
      <div className="space-y-5 p-4">
        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        <Section title="Profile">
          <Field label="Full Name">
            <TextInput value={fullName} onChange={setFullName} placeholder="Full name" />
          </Field>
          <Field label="Nickname" hint="Shown instead of Full Name throughout the app, when set.">
            <TextInput value={nickname} onChange={setNickname} placeholder="Optional" />
          </Field>
          <Field label="Position">
            <TextInput value={position} onChange={setPosition} placeholder="e.g. Sales Executive" />
          </Field>
          <Field label="Phone">
            <TextInput value={phonePrimary} onChange={setPhonePrimary} placeholder="012 345 678" type="tel" />
          </Field>
        </Section>

        <Section title="Sign-in">
          {mode === 'create' ? (
            <>
              <Field label="Email">
                <TextInput value={email} onChange={setEmail} placeholder="name@company.com" type="email" />
              </Field>
              <Field label="Password" hint="At least 8 characters -- keep the suggestion, edit it, or type your own. Share it with them securely.">
                <PasswordBox value={password} onChange={setPassword} />
              </Field>
            </>
          ) : (
            <Field label="Email">
              <p className="rounded-xl bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-500 dark:bg-neutral-800">{user?.email ?? '—'}</p>
            </Field>
          )}
        </Section>

        <Section title="Organisation">
          <Field label="Department">
            <Select value={departmentId} onChange={setDepartmentId} placeholder="No department">
              {withCurrent(departments, mode === 'edit' ? user?.departmentId : null, user?.departmentName).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={roleId} onChange={setRoleId} placeholder="Select a role" required>
              {withCurrent(roles, mode === 'edit' ? user?.roleId : null, user?.roleName).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assign Report To" hint="Their manager/supervisor -- drives who can see their attendance and visits in Team.">
            <Select value={managerId} onChange={setManagerId} placeholder="No manager">
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m.fullName, m.nickname)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Field Salesperson" hint="Tracks their attendance and customer visits (Check In, Team)." inline>
            <Switch checked={isFieldSales} onChange={setIsFieldSales} />
          </Field>
          {mode === 'edit' && (
            <Field label="Daily order target (USD)" hint="Orders expected on a full day, for the effectiveness score. Empty uses the company default; 0 leaves orders out of their score.">
              <TextInput value={orderTarget} onChange={setOrderTarget} placeholder="Company default" type="number" />
            </Field>
          )}
        </Section>

        {mode === 'edit' && modeInfo && (
          <Section title="Days off">
            <div role="radiogroup" aria-label="Days off" className="space-y-2">
              {(
                [
                  ['company', 'Company schedule', 'Works the company’s working days and hours. Weekends and public holidays are days off.'],
                  ['flexible', 'Flexible (travel)', `Works through weekends while travelling. Public holidays are off; instead of a fixed weekend they get ${rate(rates.sat)} day per Saturday and ${rate(rates.sun)} per Sunday to take when it suits their trips — in advance too. Settles each attendance cycle.`],
                ] as [DayOffMode, string, string][]
              ).map(([value, label, text]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={dayOffMode === value}
                  onClick={() => setDayOffMode(value)}
                  className={`flex w-full items-start gap-3 rounded-xl border-[1.5px] p-3 text-left ${dayOffMode === value ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-neutral-200 dark:border-neutral-700'}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${dayOffMode === value ? 'border-brand-500' : 'border-neutral-300'}`}>
                    {dayOffMode === value && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-neutral-900">{label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-neutral-500">{text}</span>
                  </span>
                </button>
              ))}
            </div>
            {modeInfo.nextMode && modeInfo.nextFrom && !modeChanges && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                Changes to {modeInfo.nextMode === 'flexible' ? 'Flexible (travel)' : 'Company schedule'} on {dayDate(modeInfo.nextFrom)}.
              </p>
            )}
            {dayOffMode !== modeInfo.mode && (
              <label className="flex items-start gap-2.5 text-xs text-neutral-600">
                <input type="checkbox" checked={thisCycle} onChange={(e) => setThisCycle(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
                <span>
                  <span className="font-semibold text-neutral-800">Start this cycle</span> — from {shortDate(modeInfo.cycleStart)}, recounting the days so far under the new rule.
                </span>
              </label>
            )}
            <p className="text-xs text-neutral-400">
              {thisCycle && dayOffMode !== modeInfo.mode
                ? `Takes effect from ${shortDate(modeInfo.cycleStart)}, the start of this attendance cycle.`
                : `Changing this takes effect from the next attendance cycle (${shortDate(modeInfo.nextCycleStart)}), so the current cycle isn’t recounted.`}
            </p>
          </Section>
        )}

        {mode === 'edit' && clockWindow && (
          <Section title="Clock-in window">
            <ClockWindowField
              label="Early clock-in"
              hint="How long before the start of their day they can clock in."
              companyMinutes={clockWindow.companyEarlyClockinMinutes}
              value={earlyMinutes}
              onChange={setEarlyMinutes}
              step={15}
              max={180}
            />
            <ClockWindowField
              label="Auto clock-out delay"
              hint="How long after the end of their day they're clocked out automatically, if still clocked in."
              companyMinutes={clockWindow.companyAutoClockoutGraceMinutes}
              value={graceMinutes}
              onChange={setGraceMinutes}
              step={15}
              max={480}
            />
          </Section>
        )}

        {mode === 'edit' && (
          <Section title="Status">
            <SegmentedControl<UserStatus>
              ariaLabel="Account status"
              shape="tabs"
              value={status}
              onChange={setStatus}
              options={STATUSES.map((st) => ({ value: st, label: st[0].toUpperCase() + st.slice(1) }))}
            />

            {status === 'suspended' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Suspended From">
                  <input
                    type="date"
                    value={suspendedFrom}
                    onChange={(e) => setSuspendedFrom(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900"
                  />
                </Field>
                <Field label="Suspended To">
                  <input
                    type="date"
                    value={suspendedTo}
                    onChange={(e) => setSuspendedTo(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900"
                  />
                </Field>
              </div>
            )}

            {status === 'discharged' && (
              <Field label="Discharged Date">
                <input
                  type="date"
                  value={dischargedDate}
                  onChange={(e) => setDischargedDate(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900"
                />
              </Field>
            )}
          </Section>
        )}











        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create User' : 'Save Changes'}
        </button>

        {mode === 'edit' &&
          (showPasswordBox ? (
            <div className="rounded-xl2 border border-neutral-200 p-3.5 dark:border-neutral-700">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-neutral-800">New Password</p>
                <button
                  onClick={() => setShowPasswordBox(false)}
                  aria-label="Cancel"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 tap-target"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-2 text-xs text-neutral-400">At least 8 characters. Takes effect immediately -- share it with them securely.</p>
              <PasswordBox value={newPassword} onChange={setNewPassword} />
              {passwordSet ? (
                <p className="mt-2.5 text-xs font-medium text-status-working">Password updated.</p>
              ) : (
                <button
                  onClick={handleSetPassword}
                  disabled={newPassword.length < MIN_PASSWORD_LENGTH || settingPassword}
                  className="mt-2.5 w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
                >
                  {settingPassword ? 'Setting…' : 'Set Password'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={openPasswordBox}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3.5 text-sm font-semibold text-neutral-700 tap-target dark:border-neutral-700 dark:text-neutral-200"
            >
              <KeyRound className="h-4 w-4" />
              Generate New Password
            </button>
          ))}

        {mode === 'edit' && isSuperAdmin && (
          <div className="rounded-xl2 border border-neutral-200 p-3.5 dark:border-neutral-700">
            <p className="mb-1.5 text-sm font-medium text-neutral-800">Google Sheet IDs</p>
            <p className="mb-2 text-xs text-neutral-400">
              What this person is called in the Google Sheet: the names or IDs in its ASSIGN_TO and salesperson cells, for example seyha or 9af927a9.
              Separate several with commas. The sync uses them to link their customers and orders to them. Super admin only.
            </p>
            {sheetIdsError && <p className="mb-2 rounded-lg bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{sheetIdsError}</p>}
            <div className="flex gap-2">
              <input
                type="text"
                value={sheetIdsText}
                disabled={sheetIdsLoading}
                onChange={(e) => {
                  setSheetIdsText(e.target.value)
                  setSheetIdsSaved(false)
                }}
                placeholder={sheetIdsLoading ? 'Loading…' : 'e.g. seyha, 9af927a9'}
                aria-label="Google Sheet IDs"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
              />
              <button
                onClick={handleSetSheetIds}
                disabled={savingSheetIds || sheetIdsLoading}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
              >
                <Sheet className="h-4 w-4" />
                {savingSheetIds ? 'Saving…' : 'Set'}
              </button>
            </div>
            {sheetIdsSaved && <p className="mt-2 text-xs font-medium text-status-working">Saved. The next sync links their customers and orders.</p>}
          </div>
        )}

        {mode === 'edit' && isSuperAdmin && (
          <div className="rounded-xl2 border border-neutral-200 p-3.5 dark:border-neutral-700">
            <p className="mb-1.5 text-sm font-medium text-neutral-800">Telegram ID</p>
            <p className="mb-2 text-xs text-neutral-400">
              Numeric Telegram chat ID -- ask them to message the bot, then check its logs for their chat ID. Used to send
              attendance alerts. Super admin only.
            </p>
            {telegramError && <p className="mb-2 rounded-lg bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{telegramError}</p>}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={telegramId}
                onChange={(e) => {
                  setTelegramId(e.target.value)
                  setTelegramIdSet(false)
                }}
                placeholder="e.g. 123456789"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
              />
              <button
                onClick={handleSetTelegramId}
                disabled={settingTelegramId}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {settingTelegramId ? 'Saving…' : 'Set'}
              </button>
            </div>
            {telegramIdSet && <p className="mt-2 text-xs font-medium text-status-working">Telegram ID updated.</p>}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

/** A titled group of fields, like the sections of an iOS settings form. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">{title}</h3>
      <div className="space-y-3.5 rounded-2xl border border-neutral-200 p-3.5 dark:border-neutral-700">{children}</div>
    </section>
  )
}

function Field({ label, hint, inline, children }: { label: string; hint?: string; inline?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-800">{label}</p>
        {inline && children}
      </div>
      {hint && <p className="mb-1.5 text-xs text-neutral-400">{hint}</p>}
      {!inline && children}
    </div>
  )
}

/** One clock-window setting: the company's, or (switched on) this person's own minutes. */
function ClockWindowField({
  label,
  hint,
  companyMinutes,
  value,
  onChange,
  step,
  max,
}: {
  label: string
  hint: string
  companyMinutes: number
  value: number | null
  onChange: (v: number | null) => void
  step: number
  max: number
}) {
  const own = value !== null
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-800">{label}</p>
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          Own setting
          <Switch checked={own} onChange={(on) => onChange(on ? companyMinutes : null)} />
        </label>
      </div>
      <p className="mb-1.5 text-xs text-neutral-400">{hint}</p>
      {own ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">Company: {companyMinutes} min</p>
          <Stepper label={label} value={value} step={step} max={max} format={(v) => `${v} min`} onChange={onChange} />
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Company setting: {companyMinutes} min</p>
      )}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
    />
  )
}

/** The picker's active options, plus the person's current one when it has since been switched off -- so editing them doesn't silently change it. */
function withCurrent(options: Option[], currentId: string | null | undefined, currentName: string | null | undefined): Option[] {
  if (!currentId || options.some((o) => o.id === currentId)) return options
  return [...options, { id: currentId, name: `${currentName ?? 'Current'} (inactive)` }]
}

function Select({
  value,
  onChange,
  placeholder,
  required,
  children,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900"
    >
      {placeholder && (
        <option value="" disabled={required}>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic('light')
        onChange(!checked)
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-neutral-200'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
