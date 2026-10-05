import { useEffect, useState } from 'react'
import { Building2, Crosshair, Loader2, LocateFixed, LogOut, PauseCircle, RefreshCw, ShieldAlert, Store, Timer } from 'lucide-react'
import { Circle, Marker } from 'react-leaflet'
import { AdminFrame, AdminGroup, AdminRow, AdminSwitch } from '@/components/AdminKit'
import { Stepper } from '@/components/Stepper'
import { useProfile } from '@/features/auth/useProfile'
import { useLocations } from '@/features/locations/useLocations'
import { LocationFormSheet } from '@/features/locations/LocationFormSheet'
import type { WorkLocationRow } from '@/features/locations/locationsService'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { settingsService, type EditableSettings } from '@/features/settings/settingsService'
import { ALLOWED_CHECKIN_RADII_METERS, ALLOWED_LOCATION_PING_MINUTES } from '@/lib/config'
import { haptic } from '@/lib/haptic'

/**
 * Geofence & rules (Admin), laid out like the canvas (Polish › Admin ›
 * Geofence & rules): the work locations on a map and in a list, how close
 * a rep must be to check in at a customer, and the GPS and alert
 * thresholds. Writes go to work_locations and the app_settings row; RLS
 * (settings:edit) is the real gate.
 */
export function GeofencePage() {
  const { profile, loading } = useProfile()
  if (loading) return <div className="mx-auto mt-4 h-40 max-w-lg animate-pulse rounded-2xl bg-neutral-100" />
  if (!profile?.is_super_admin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center">
        <ShieldAlert className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Only a super admin can change locations and rules.</p>
      </div>
    )
  }
  return <Geofence />
}

function Chips<T extends number>({ options, value, unit, onChange }: { options: readonly T[]; value: T; unit: string; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              haptic('light')
              onChange(o)
            }}
            className={`h-9 flex-1 rounded-[10px] border text-[13px] font-bold ${on ? 'border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900' : 'border-neutral-200 text-neutral-900'}`}
          >
            {o} {unit}
          </button>
        )
      })}
    </div>
  )
}

function Geofence() {
  const { locations, refresh } = useLocations()
  const [settings, setSettings] = useState<EditableSettings | null>(null)
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; location: WorkLocationRow | null } | null>(null)

  useEffect(() => {
    settingsService
      .get()
      .then((s) => {
        setSettings(s)
        setSaved(JSON.stringify(s))
      })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not load the settings.' }))
  }, [])

  const active = locations.filter((l) => l.active)
  const points = active.map((l) => [l.latitude, l.longitude] as [number, number])
  const dirty = !!settings && JSON.stringify(settings) !== saved
  const patch = (p: Partial<EditableSettings>) => setSettings((s) => (s ? { ...s, ...p } : s))

  async function save() {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    try {
      await settingsService.update(settings)
      setSaved(JSON.stringify(settings))
      haptic('success')
      setMessage({ ok: true, text: 'Saved. Everyone gets the new rules the next time the app checks in.' })
    } catch (e) {
      haptic('error')
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminFrame sub="Locations, geofence and thresholds">
      {points.length > 0 && (
        <section aria-label="Map" className="relative overflow-hidden rounded-[18px]">
          <MapView points={points} height={170} rounded={false}>
            {active.map((l) => (
              <span key={l.id}>
                <Circle center={[l.latitude, l.longitude]} radius={l.radius_m} pathOptions={{ color: '#006ACC', weight: 1.5, dashArray: '4 4', fillOpacity: 0.12 }} />
                <Marker position={[l.latitude, l.longitude]} icon={pinIcon('#1c1c1c', { size: 24 })} />
              </span>
            ))}
          </MapView>
          {active[0] && (
            <span className="pointer-events-none absolute bottom-2.5 left-3 z-[500] inline-flex h-[26px] items-center rounded-full bg-white px-2.5 text-xs font-bold text-neutral-900 shadow-card">
              {active[0].name} · {active[0].radius_m} m
            </span>
          )}
        </section>
      )}

      <AdminGroup title={`Work locations · ${locations.length}`} add="Add a location" onAdd={() => setForm({ mode: 'create', location: null })}>
        {locations.length === 0 && <p className="border-t border-neutral-100 py-3 text-[13px] text-neutral-500 dark:border-neutral-800">No work locations yet. People can clock in anywhere until one is set.</p>}
        {locations.map((l) => (
          <AdminRow
            key={l.id}
            icon={Building2}
            label={l.name}
            sub={l.active ? 'Clock-in place' : 'Turned off'}
            value={`${l.radius_m} m`}
            pill={l.active ? undefined : { text: 'Off', tone: 'plain' }}
            onClick={() => setForm({ mode: 'edit', location: l })}
          />
        ))}
      </AdminGroup>

      {!settings ? (
        message ? <p className="text-sm text-status-danger">{message.text}</p> : <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
      ) : (
        <>
          <section aria-label="Customer check-in">
            <div className="flex items-baseline justify-between">
              <h2 className="mb-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Customer check-in</h2>
              <span className="text-[15px] font-bold text-neutral-900">{settings.checkinRadiusM} m</span>
            </div>
            <div className="mt-2">
              <Chips options={ALLOWED_CHECKIN_RADII_METERS} value={settings.checkinRadiusM as (typeof ALLOWED_CHECKIN_RADII_METERS)[number]} unit="m" onChange={(v) => patch({ checkinRadiusM: v })} />
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">How close to the shop pin a rep must be to check in. Further away shows “Far away” and asks why.</p>
            <div className="mt-2 border-b border-neutral-100 dark:border-neutral-800">
              <AdminRow
                icon={LogOut}
                label="Check out when they leave"
                sub="Close the visit automatically outside the shop zone"
                control={<AdminSwitch on={settings.autoCheckoutEnabled} label="Check out when they leave" onToggle={() => patch({ autoCheckoutEnabled: !settings.autoCheckoutEnabled })} />}
              />
            </div>
          </section>

          <AdminGroup title="Thresholds">
            <AdminRow
              icon={Crosshair}
              label="GPS must be better than"
              sub="Otherwise ask to wait or refresh"
              control={<Stepper label="GPS accuracy" value={settings.maxLocationAccuracyM} step={10} min={10} max={500} format={(v) => `± ${v} m`} onChange={(v) => patch({ maxLocationAccuracyM: v })} />}
            />
            <AdminRow
              icon={PauseCircle}
              label="Flag a gap after"
              sub="Clocked in with no visit open"
              control={<Stepper label="Idle threshold" value={settings.idleAlertThresholdMinutes} step={5} min={5} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ idleAlertThresholdMinutes: v })} />}
            />
            <AdminRow
              icon={Timer}
              label="Flag a short visit under"
              sub="Counted as an ineffective visit"
              control={<Stepper label="Short visit threshold" value={settings.shortVisitThresholdMinutes} step={1} min={1} max={60} format={(v) => `${v} min`} onChange={(v) => patch({ shortVisitThresholdMinutes: v })} />}
            />
          </AdminGroup>
          <section aria-label="Save location every">
            <div className="flex items-baseline justify-between">
              <h2 className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Save location every
              </h2>
              <span className="text-[15px] font-bold text-neutral-900">{settings.locationPingIntervalMinutes} min</span>
            </div>
            <div className="mt-2">
              <Chips
                options={ALLOWED_LOCATION_PING_MINUTES}
                value={settings.locationPingIntervalMinutes as (typeof ALLOWED_LOCATION_PING_MINUTES)[number]}
                unit="min"
                onChange={(v) => patch({ locationPingIntervalMinutes: v })}
              />
            </div>
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-neutral-500">
              <LocateFixed className="h-3 w-3" aria-hidden /> Only while someone is on a visit. More often uses more battery.
            </p>
          </section>
          <p className="-mt-2 inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Store className="h-3.5 w-3.5" aria-hidden /> Clock-in places and their radius are set per location above.
          </p>
        </>
      )}

      {message && settings && <p className={`rounded-xl px-3 py-2 text-sm ${message.ok ? 'bg-status-working/10 text-status-working' : 'bg-status-danger/10 text-status-danger'}`}>{message.text}</p>}
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 px-4 md:bottom-6">
          <div className="mx-auto max-w-lg md:max-w-2xl">
            <button type="button" onClick={save} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white shadow-lg disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}

      <LocationFormSheet open={form !== null} mode={form?.mode ?? 'create'} location={form?.location ?? null} onClose={() => setForm(null)} onSaved={() => refresh()} />
    </AdminFrame>
  )
}
