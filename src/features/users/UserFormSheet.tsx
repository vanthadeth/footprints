import { useEffect, useState, type ReactNode } from 'react'
import { KeyRound, X } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { displayName } from '@/lib/displayName'
import { haptic } from '@/lib/haptic'
import { generateSuggestedPassword, PasswordBox } from './PasswordBox'
import { usersService, type ManagedUser, type Option, type UserStatus } from './usersService'

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
  const [status, setStatus] = useState<UserStatus>('active')
  const [suspendedFrom, setSuspendedFrom] = useState('')
  const [suspendedTo, setSuspendedTo] = useState('')
  const [dischargedDate, setDischargedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The "Generate New Password" box (edit mode only) is opt-in and separate
  // from the main Save action -- setting a password takes effect the
  // moment it's confirmed, unlike the other fields which wait for Save.
  const [showPasswordBox, setShowPasswordBox] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [passwordSet, setPasswordSet] = useState(false)

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
    setSuspendedFrom('')
    setSuspendedTo('')
    setDischargedDate('')
    setShowPasswordBox(false)
    setNewPassword('')
    setPasswordSet(false)
  }, [open, mode, user])

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
          suspendedFrom: suspendedFrom || null,
          suspendedTo: suspendedTo || null,
          dischargedDate: dischargedDate || null,
        })
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

  const managerOptions = users.filter((u) => u.id !== user?.id)

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === 'create' ? 'New User' : 'Edit User'}>
      <div className="space-y-4 p-4">
        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        <Field label="Full Name">
          <TextInput value={fullName} onChange={setFullName} placeholder="Full name" />
        </Field>

        <Field label="Nickname" hint="Shown instead of Full Name throughout the app, when set.">
          <TextInput value={nickname} onChange={setNickname} placeholder="Optional" />
        </Field>

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

        <Field label="Phone">
          <TextInput value={phonePrimary} onChange={setPhonePrimary} placeholder="012 345 678" type="tel" />
        </Field>

        <Field label="Position">
          <TextInput value={position} onChange={setPosition} placeholder="e.g. Sales Executive" />
        </Field>

        <Field label="Department">
          <Select value={departmentId} onChange={setDepartmentId} placeholder="No department">
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Role">
          <Select value={roleId} onChange={setRoleId} placeholder="Select a role" required>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Assign Report To" hint="Their manager/supervisor -- drives who can see their attendance and visits in Fleet.">
          <Select value={managerId} onChange={setManagerId} placeholder="No manager">
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {displayName(m.fullName, m.nickname)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Field Salesperson" hint="Tracks their attendance and customer visits (Check In, Fleet)." inline>
          <Switch checked={isFieldSales} onChange={setIsFieldSales} />
        </Field>

        {mode === 'edit' && (
          <>
            <Field label="Status">
              <Select value={status} onChange={(v) => setStatus(v as UserStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>

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
          </>
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
      </div>
    </BottomSheet>
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
