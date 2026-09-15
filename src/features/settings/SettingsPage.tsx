import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ShieldAlert } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { AppearanceControl } from '@/components/AppearanceControl'
import { ALLOWED_CHECKIN_RADII_METERS, ALLOWED_LOCATION_PING_MINUTES } from '@/lib/config'
import { haptic } from '@/lib/haptic'
import { settingsService, type EditableSettings } from './settingsService'

/**
 * Global settings a super admin (`users.is_super_admin`) sets for everyone
 * -- this is what useAppSettings() reads everywhere else in the app
 * (location ping frequency, geofence radius, auto check-out, working
 * hours). RLS (`app_settings_update`, gated on the `settings:edit`
 * permission, which a super admin always has via app.can()'s blanket
 * 'any' scope) is the real enforcement; the check below just keeps the
 * form from showing to people who couldn't save it anyway.
 */
export function SettingsPage() {
  const { profile, loading: profileLoading } = useProfile()

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:max-w-2xl">
      {/* Appearance is everyone's, not just a super admin's -- the rest of
          this screen (below) is the global config only a super admin can
          see or edit. */}
      <Section title="Appearance">
        <AppearanceControl />
      </Section>

      {profileLoading ? (
        <div className="h-48 animate-pulse rounded-xl2 bg-neutral-100" />
      ) : !profile?.is_super_admin ? (
        <div className="flex flex-col items-center px-6 pt-10 text-center">
          <ShieldAlert className="h-10 w-10 text-neutral-300" />
          <p className="mt-4 text-sm text-neutral-500">Only a super admin can view global settings.</p>
        </div>
      ) : (
        <SettingsForm />
      )}
    </div>
  )
}

function SettingsForm() {
  const [settings, setSettings] = useState<EditableSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    settingsService
      .get()
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load settings.'))
      .finally(() => setLoading(false))
  }, [])

  function patch(partial: Partial<EditableSettings>) {
    setSettings((s) => (s ? { ...s, ...partial } : s))
    setSaved(false)
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      await settingsService.update(settings)
      haptic('success')
      setSaved(true)
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <div className="h-32 animate-pulse rounded-xl2 bg-neutral-100" />
        <div className="h-48 animate-pulse rounded-xl2 bg-neutral-100" />
      </>
    )
  }

  if (!settings) {
    return <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error ?? 'Settings unavailable.'}</p>
  }

  return (
    <>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Section title="Location">
        <Field label="Geofence Radius" hint="Check-in-to-customer and moved-away distance.">
          <div className="flex gap-2">
            {ALLOWED_CHECKIN_RADII_METERS.map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => patch({ checkinRadiusM: radius })}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold tap-target ${
                  settings.checkinRadiusM === radius ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
                }`}
              >
                {radius} m
              </button>
            ))}
          </div>
        </Field>

        <Field label="Location Ping Frequency" hint="How often an active visit's location is checked.">
          <div className="flex gap-2">
            {ALLOWED_LOCATION_PING_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => patch({ locationPingIntervalMinutes: minutes })}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold tap-target ${
                  settings.locationPingIntervalMinutes === minutes
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-neutral-200 bg-white text-neutral-600'
                }`}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </Field>

        <Field label="Auto Check Out" hint="Automatically check out a visit if the user moves outside the geofence." inline>
          <Switch checked={settings.autoCheckoutEnabled} onChange={(v) => patch({ autoCheckoutEnabled: v })} />
        </Field>
      </Section>

      <Section title="Working Hours">
        <Field label="Start Time">
          <input
            type="time"
            value={settings.workStartTime}
            onChange={(e) => patch({ workStartTime: e.target.value })}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-900"
          />
        </Field>
        <Field label="End Time">
          <input
            type="time"
            value={settings.workEndTime}
            onChange={(e) => patch({ workEndTime: e.target.value })}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-900"
          />
        </Field>
        <Field label="Allow Clock In" hint="Minutes before Start Time that clocking in is still allowed.">
          <NumberInput
            value={settings.allowEarlyClockinMinutes}
            min={0}
            suffix="min before"
            onChange={(v) => patch({ allowEarlyClockinMinutes: v })}
          />
        </Field>
        <Field label="Auto Clock Out" hint="Minutes after End Time before an open attendance is clocked out automatically.">
          <NumberInput
            value={settings.autoClockoutGraceMinutes}
            min={0}
            suffix="min after"
            onChange={(v) => patch({ autoClockoutGraceMinutes: v })}
          />
        </Field>
      </Section>

      <Section title="Notifications">
        <Field label="Late Clock-In Threshold" hint="Minutes after Start Time before a clock-in is flagged as late.">
          <NumberInput
            value={settings.lateClockinThresholdMinutes}
            min={0}
            suffix="min after start"
            onChange={(v) => patch({ lateClockinThresholdMinutes: v })}
          />
        </Field>
        <Field label="Idle Alert Threshold" hint="Minutes clocked in with no open visit before an idling notification fires.">
          <NumberInput
            value={settings.idleAlertThresholdMinutes}
            min={0}
            suffix="min idle"
            onChange={(v) => patch({ idleAlertThresholdMinutes: v })}
          />
        </Field>
        <Field label="Short Visit Threshold" hint="A completed visit shorter than this is flagged as ineffective.">
          <NumberInput
            value={settings.shortVisitThresholdMinutes}
            min={0}
            suffix="min minimum"
            onChange={(v) => patch({ shortVisitThresholdMinutes: v })}
          />
        </Field>
      </Section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
      >
        {saved && !saving ? (
          <>
            <Check className="h-4 w-4" /> Saved
          </>
        ) : saving ? (
          'Saving…'
        ) : (
          'Save Settings'
        )}
      </button>
      <p className="text-center text-xs text-neutral-400">These settings apply globally, to every user, immediately.</p>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
      <p className="px-4 pt-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="space-y-4 p-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  inline,
  children,
}: {
  label: string
  hint?: string
  /** Renders `children` next to the label (e.g. a toggle) instead of below it. */
  inline?: boolean
  children: ReactNode
}) {
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

function NumberInput({
  value,
  onChange,
  min,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  suffix: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next)) onChange(Math.max(min, Math.round(next)))
        }}
        className="w-24 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-900"
      />
      <span className="text-xs text-neutral-400">{suffix}</span>
    </div>
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
