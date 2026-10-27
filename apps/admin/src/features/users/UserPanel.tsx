import { useEffect, useState } from 'react'
import { SidePanel } from '@footprints/shared/components/desktop/SidePanel'
import { generateSuggestedPassword, PasswordBox } from '@footprints/shared/features/users/PasswordBox'
import { formatSheetIds, parseSheetIds } from '@footprints/shared/features/users/sheetIds'
import { usersService, type ManagedUser, type Option, type UserStatus } from '@footprints/shared/features/users/usersService'
import { displayName } from '@footprints/shared/lib/displayName'
import { Field, Notice, PrimaryButton, SecondaryButton, Section, Select, TextInput, Toggle } from '@/components/form'

const STATUSES: [UserStatus, string][] = [
  ['active', 'Active'],
  ['suspended', 'Suspended'],
  ['discharged', 'Left the company'],
]
const MIN_PASSWORD_LENGTH = 8

/** An inactive role/department the person already has stays selectable, so saving other fields doesn't drop it. */
function withCurrent(options: Option[], id: string | null | undefined, name: string | null | undefined): Option[] {
  return id && !options.some((o) => o.id === id) ? [...options, { id, name: name ?? 'Current' }] : options
}

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

/** Create or edit one user in a side panel. Password, Telegram ID and Google Sheet IDs are their own immediate actions, separate from Save. */
export function UserPanel({ open, mode, user, users, roles, departments, onClose, onSaved }: Props) {
  const [f, setF] = useState({
    fullName: '', nickname: '', email: '', password: '', phone: '', position: '',
    departmentId: '', managerId: '', roleId: '', isFieldSales: false, orderTarget: '', targetRequired: true,
    status: 'active' as UserStatus, suspendedFrom: '', suspendedTo: '', dischargedDate: '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [telegramId, setTelegramId] = useState('')
  const [telegramMsg, setTelegramMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [sheetIds, setSheetIds] = useState('')
  const [sheetIdsMsg, setSheetIdsMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<'password' | 'telegram' | 'sheet' | null>(null)

  const editing = mode === 'edit' && user
  useEffect(() => {
    if (!open) return
    const u = editing ? user : null
    setError(null)
    setF({
      fullName: u?.fullName ?? '', nickname: u?.nickname ?? '', email: '',
      password: u ? '' : generateSuggestedPassword(), phone: u?.phonePrimary ?? '', position: u?.position ?? '',
      departmentId: u?.departmentId ?? '', managerId: u?.managerId ?? '', roleId: u?.roleId ?? '',
      isFieldSales: u?.isFieldSales ?? false, orderTarget: '', targetRequired: true, status: u?.status ?? 'active',
      suspendedFrom: '', suspendedTo: '', dischargedDate: '',
    })
    setNewPassword(null)
    setPasswordMsg(null)
    setTelegramId(u?.telegramId ?? '')
    setTelegramMsg(null)
    setSheetIds('')
    setSheetIdsMsg(null)
    if (!u) return
    let cancelled = false
    usersService.salesTarget(u.id).then((t) => { if (!cancelled) { set('orderTarget', t.monthlyUsd == null ? '' : String(t.monthlyUsd)); set('targetRequired', t.required) } }).catch(() => {})
    usersService.sheetIds(u.id).then((ids) => !cancelled && setSheetIds(formatSheetIds(ids))).catch((e) => !cancelled && setSheetIdsMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t load the Google Sheet IDs.' }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, user])

  const statusNeedsInput = (f.status === 'suspended' && (!f.suspendedFrom || !f.suspendedTo)) || (f.status === 'discharged' && !f.dischargedDate)
  const canSave = !!f.fullName.trim() && !!f.roleId && (editing || (!!f.email.trim() && f.password.length >= MIN_PASSWORD_LENGTH)) && !statusNeedsInput

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const common = {
        fullName: f.fullName.trim(),
        nickname: f.nickname.trim() || null,
        phonePrimary: f.phone.trim() || null,
        position: f.position.trim() || null,
        departmentId: f.departmentId || null,
        managerId: f.managerId || null,
        isFieldSales: f.isFieldSales,
      }
      if (!editing) {
        await usersService.create({ ...common, email: f.email.trim(), password: f.password, roleId: f.roleId })
      } else {
        await usersService.update(user.id, {
          ...common,
          roleId: f.roleId || null,
          status: f.status,
          monthlyOrderTargetUsd: f.orderTarget.trim() === '' ? null : Math.max(0, Number(f.orderTarget) || 0),
          salesTargetRequired: f.targetRequired,
          suspendedFrom: f.suspendedFrom || null,
          suspendedTo: f.suspendedTo || null,
          dischargedDate: f.dischargedDate || null,
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function run(kind: 'password' | 'telegram' | 'sheet', action: () => Promise<string>, set: (m: { ok: boolean; text: string }) => void, failure: string) {
    setBusy(kind)
    try {
      set({ ok: true, text: await action() })
    } catch (e) {
      set({ ok: false, text: e instanceof Error ? e.message : failure })
    } finally {
      setBusy(null)
    }
  }

  const managers = users.filter((u) => u.id !== user?.id)

  return (
    <SidePanel open={open} onClose={onClose} title={editing ? 'Edit user' : 'New user'} width="max-w-xl">
      <div className="space-y-6 p-6">
        {error && <Notice tone="error">{error}</Notice>}

        <Section title="Profile">
          <Field label="Full name"><TextInput value={f.fullName} onChange={(v) => set('fullName', v)} /></Field>
          <Field label="Nickname" hint="Shown instead of the full name throughout the app, when set."><TextInput value={f.nickname} onChange={(v) => set('nickname', v)} placeholder="Optional" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position"><TextInput value={f.position} onChange={(v) => set('position', v)} placeholder="e.g. Sales Executive" /></Field>
            <Field label="Phone"><TextInput value={f.phone} onChange={(v) => set('phone', v)} type="tel" placeholder="012 345 678" /></Field>
          </div>
        </Section>

        <Section title="Sign-in">
          {editing ? (
            <Field label="Email"><TextInput value={user.email ?? ''} onChange={() => {}} disabled /></Field>
          ) : (
            <>
              <Field label="Email"><TextInput value={f.email} onChange={(v) => set('email', v)} type="email" placeholder="name@company.com" /></Field>
              <Field label="Password" hint="At least 8 characters. Keep the suggestion, edit it, or type your own, then share it securely.">
                <PasswordBox value={f.password} onChange={(v) => set('password', v)} />
              </Field>
            </>
          )}
        </Section>

        <Section title="Organisation">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={f.roleId} onChange={(v) => set('roleId', v)} placeholder="Select a role">
                {withCurrent(roles, editing ? user.roleId : null, user?.roleName).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Department">
              <Select value={f.departmentId} onChange={(v) => set('departmentId', v)} placeholder="No department">
                {withCurrent(departments, editing ? user.departmentId : null, user?.departmentName).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Reports to" hint="Their manager. Drives who can see their attendance and visits.">
            <Select value={f.managerId} onChange={(v) => set('managerId', v)} placeholder="No manager">
              {managers.map((m) => <option key={m.id} value={m.id}>{displayName(m.fullName, m.nickname)}</option>)}
            </Select>
          </Field>
          <Toggle checked={f.isFieldSales} onChange={(v) => set('isFieldSales', v)} label="Field salesperson (tracks attendance and customer visits)" />
          {editing && (
            <>
              <Toggle checked={f.targetRequired} onChange={(v) => set('targetRequired', v)} label="Has to achieve a sales target (off: no orders part in their score, left out of the team's target)" />
              {f.targetRequired && (
                <Field label="Monthly sales target (USD)" hint="Each day's score uses a share of it. Empty uses the company default; 0 means no target.">
                  <TextInput value={f.orderTarget} onChange={(v) => set('orderTarget', v)} type="number" placeholder="Company default" />
                </Field>
              )}
            </>
          )}
        </Section>

        {editing && (
          <Section title="Status">
            <Field label="Account status">
              <Select value={f.status} onChange={(v) => set('status', v as UserStatus)}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            {f.status === 'suspended' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Suspended from"><TextInput type="date" value={f.suspendedFrom} onChange={(v) => set('suspendedFrom', v)} /></Field>
                <Field label="Suspended to"><TextInput type="date" value={f.suspendedTo} onChange={(v) => set('suspendedTo', v)} /></Field>
              </div>
            )}
            {f.status === 'discharged' && <Field label="Last day"><TextInput type="date" value={f.dischargedDate} onChange={(v) => set('dischargedDate', v)} /></Field>}
          </Section>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create user'}</PrimaryButton>
        </div>

        {editing && (
          <>
            <Section title="Reset password">
              <p className="text-xs text-neutral-500">Takes effect immediately; they’ll be asked to choose their own at next sign-in.</p>
              {newPassword === null ? (
                <SecondaryButton onClick={() => { setNewPassword(generateSuggestedPassword()); setPasswordMsg(null) }}>Generate new password</SecondaryButton>
              ) : (
                <>
                  <PasswordBox value={newPassword} onChange={setNewPassword} />
                  <PrimaryButton
                    disabled={newPassword.length < MIN_PASSWORD_LENGTH || busy === 'password'}
                    onClick={() => run('password', async () => { await usersService.resetPassword(user.id, newPassword); return 'Password set. Share it with them securely.' }, setPasswordMsg, 'Failed to set the new password.')}
                  >
                    {busy === 'password' ? 'Setting…' : 'Set this password'}
                  </PrimaryButton>
                </>
              )}
              {passwordMsg && <Notice tone={passwordMsg.ok ? 'ok' : 'error'}>{passwordMsg.text}</Notice>}
            </Section>

            <Section title="Telegram ID">
              <Field label="Chat ID" hint="Where manager alerts are sent. Message the bot “get my id” to find it.">
                <TextInput value={telegramId} onChange={setTelegramId} placeholder="Optional" />
              </Field>
              <SecondaryButton disabled={busy === 'telegram'} onClick={() => run('telegram', async () => { await usersService.setTelegramId(user.id, telegramId.trim() || null); onSaved(); return 'Telegram ID saved.' }, setTelegramMsg, 'Failed to set the Telegram ID.')}>
                {busy === 'telegram' ? 'Saving…' : 'Save Telegram ID'}
              </SecondaryButton>
              {telegramMsg && <Notice tone={telegramMsg.ok ? 'ok' : 'error'}>{telegramMsg.text}</Notice>}
            </Section>

            <Section title="Google Sheet IDs">
              <Field label="IDs" hint="How they appear in the sheet’s ASSIGN_TO column. Separate with commas or spaces; the sheet sync uses these to link customers and orders.">
                <TextInput value={sheetIds} onChange={setSheetIds} placeholder="Optional" />
              </Field>
              <SecondaryButton disabled={busy === 'sheet'} onClick={() => run('sheet', async () => { const ids = parseSheetIds(sheetIds); await usersService.setSheetIds(user.id, ids); setSheetIds(formatSheetIds(ids)); return 'Google Sheet IDs saved.' }, setSheetIdsMsg, 'Failed to save the Google Sheet IDs.')}>
                {busy === 'sheet' ? 'Saving…' : 'Save Sheet IDs'}
              </SecondaryButton>
              {sheetIdsMsg && <Notice tone={sheetIdsMsg.ok ? 'ok' : 'error'}>{sheetIdsMsg.text}</Notice>}
            </Section>
          </>
        )}
      </div>
    </SidePanel>
  )
}
