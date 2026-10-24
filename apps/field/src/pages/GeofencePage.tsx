import { useEffect, useState } from 'react'
import { Building2, Clock3, Crosshair, Loader2, LocateFixed, LogOut, PauseCircle, RefreshCw, Route, ShieldAlert, Store, Timer } from 'lucide-react'
import { Circle, Marker } from 'react-leaflet'
import { AdminFrame, AdminGroup, AdminRow, AdminSwitch } from '@footprints/shared/components/AdminKit'
import { Stepper } from '@/components/Stepper'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useLocations } from '@/features/locations/useLocations'
import { LocationFormSheet } from '@/features/locations/LocationFormSheet'
import type { WorkLocationRow } from '@/features/locations/locationsService'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { settingsService, type EditableSettings } from '@/features/settings/settingsService'
import { ALLOWED_CHECKIN_RADII_METERS, ALLOWED_LOCATION_PING_MINUTES } from '@footprints/shared/lib/config'
import { haptic } from '@footprints/shared/lib/haptic'

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
  const windowInvalid = !!settings && settings.checkWindowEnd <= settings.checkWindowStart
  const lunchInvalid = !!settings && settings.lunchWindowEnd <= settings.lunchWindowStart
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
              label="Flag a gap longer than"
              sub="After the first visit: between visits, and after the last check-out"
              control={<Stepper label="Idle threshold" value={settings.idleAlertThresholdMinutes} step={5} min={5} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ idleAlertThresholdMinutes: v })} />}
            />
            <AdminRow
              icon={Timer}
              label="Flag a short visit under"
              sub="Flagged on the visit and counted as an ineffective visit"
              control={<Stepper label="Short visit threshold" value={settings.shortVisitThresholdMinutes} step={1} min={1} max={60} format={(v) => `${v} min`} onChange={(v) => patch({ shortVisitThresholdMinutes: v })} />}
            />
          </AdminGroup>
          <AdminGroup title="Check-in and check-out hours">
            <AdminRow
              icon={Clock3}
              label="Opens at"
              sub="Customer check-in and check-out are refused before this"
              control={<input type="time" value={settings.checkWindowStart} onChange={(e) => patch({ checkWindowStart: e.target.value || '07:00' })} aria-label="Check-in opens at" className="h-9 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-bold text-neutral-900 dark:border-neutral-700" />}
            />
            <AdminRow
              icon={Clock3}
              label="Closes at"
              sub="…and after this"
              control={<input type="time" value={settings.checkWindowEnd} onChange={(e) => patch({ checkWindowEnd: e.target.value || '20:00' })} aria-label="Check-in closes at" className="h-9 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-bold text-neutral-900 dark:border-neutral-700" />}
            />
          </AdminGroup>
          {windowInvalid && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">Closing time must be after opening time.</p>}

          <AdminGroup title="Flag rules">
            <AdminRow
              icon={Clock3}
              label="First customer visit by"
              sub="A first visit after this time is flagged, and so is none by then"
              control={<input type="time" value={settings.firstVisitDeadline} onChange={(e) => patch({ firstVisitDeadline: e.target.value || '10:00' })} aria-label="First customer visit by" className="h-9 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-bold text-neutral-900 dark:border-neutral-700" />}
            />
            <AdminRow
              icon={Clock3}
              label="Possible lunch break"
              sub="A gap overlapping this window needs the longer limit below"
              control={
                <span className="flex items-center gap-1.5">
                  <input type="time" value={settings.lunchWindowStart} onChange={(e) => patch({ lunchWindowStart: e.target.value || '11:00' })} aria-label="Lunch window starts" className="h-9 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-bold text-neutral-900 dark:border-neutral-700" />
                  <span className="text-neutral-400">–</span>
                  <input type="time" value={settings.lunchWindowEnd} onChange={(e) => patch({ lunchWindowEnd: e.target.value || '14:00' })} aria-label="Lunch window ends" className="h-9 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-bold text-neutral-900 dark:border-neutral-700" />
                </span>
              }
            />
            <AdminRow
              icon={PauseCircle}
              label="Flag a lunch-time gap longer than"
              sub="Instead of the limit above, for a gap overlapping lunch"
              control={<Stepper label="Lunch gap limit" value={settings.lunchIdleThresholdMinutes} step={15} min={30} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ lunchIdleThresholdMinutes: v })} />}
            />
            <AdminRow
              icon={Timer}
              label="A forgotten check-out counts at most"
              sub="When a visit is closed at clock-out or end of day; the rest is a gap"
              control={<Stepper label="Forgotten visit cap" value={settings.forgottenVisitCapMinutes} step={5} min={5} max={120} format={(v) => `${v} min`} onChange={(v) => patch({ forgottenVisitCapMinutes: v })} />}
            />
            <AdminRow
              icon={Timer}
              label="A visit counts toward effectiveness for at most"
              sub="Visits shorter than the short-visit limit count nothing; longer time isn't credited"
              control={<Stepper label="Visit credit cap" value={settings.visitCreditCapMinutes} step={5} min={10} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ visitCreditCapMinutes: v })} />}
            />
            <AdminRow
              icon={Store}
              label="Visits expected per full day"
              sub="The effectiveness score's visit target; a shorter day is scaled by its hours"
              control={<Stepper label="Daily visit target" value={settings.dailyVisitTarget} step={1} min={1} max={100} format={(v) => `${v}`} onChange={(v) => patch({ dailyVisitTarget: v })} />}
            />
            <AdminRow
              icon={Store}
              label="Orders expected per full day"
              sub="The score's orders part, in USD, for people without their own target (set on their user); a shorter day is scaled by its hours"
              control={<Stepper label="Daily order target" value={settings.dailyOrderTargetUsd} step={50} min={0} max={20000} format={(v) => (v === 0 ? 'None' : `$${v}`)} onChange={(v) => patch({ dailyOrderTargetUsd: v })} />}
            />
            <AdminRow
              icon={Store}
              label="Unique customers expected per full day"
              sub="A shorter day, such as a half-day Saturday, is scaled by its hours"
              control={<Stepper label="Daily unique customers" value={settings.dailyUniqueCustomerTarget} step={1} min={1} max={50} format={(v) => `${v}`} onChange={(v) => patch({ dailyUniqueCustomerTarget: v })} />}
            />
          </AdminGroup>
          <AdminGroup title="Long travel (effectiveness score)">
            <AdminRow
              icon={Route}
              label="Take travel time off working hours"
              sub="On a day with long travel and a visit outside the home city, the score is measured against fewer hours"
              control={<AdminSwitch on={settings.travel.enabled} label="Long travel deduction" onToggle={() => patch({ travel: { ...settings.travel, enabled: !settings.travel.enabled } })} />}
            />
            {settings.travel.enabled && (
              <>
                <AdminRow
                  icon={Route}
                  label="Applies when the day's travel is over"
                  sub="Straight-line distance through clock-in, visits and clock-out"
                  control={<Stepper label="Travel threshold" value={settings.travel.minKm} step={5} min={0} max={500} format={(v) => `${v} km`} onChange={(v) => patch({ travel: { ...settings.travel, minKm: v } })} />}
                />
                <AdminRow
                  icon={Route}
                  label="For every full"
                  sub="Distance steps counted over the whole day's travel"
                  control={<Stepper label="Travel step" value={settings.travel.stepKm} step={5} min={1} max={200} format={(v) => `${v} km`} onChange={(v) => patch({ travel: { ...settings.travel, stepKm: v } })} />}
                />
                <AdminRow
                  icon={Timer}
                  label="Take off"
                  sub="Minutes off the paid working hours for each step"
                  control={<Stepper label="Minutes per step" value={settings.travel.minutes} step={5} min={0} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ travel: { ...settings.travel, minutes: v } })} />}
                />
                <AdminRow
                  icon={Building2}
                  label="Home city radius"
                  sub={`Visits within this distance of ${settings.travel.homeLat.toFixed(4)}, ${settings.travel.homeLng.toFixed(4)} (Phnom Penh) don't trigger it`}
                  control={<Stepper label="Home city radius" value={settings.travel.homeRadiusKm} step={5} min={1} max={200} format={(v) => `${v} km`} onChange={(v) => patch({ travel: { ...settings.travel, homeRadiusKm: v } })} />}
                />
              </>
            )}
          </AdminGroup>
          <AdminGroup title="First visit far from clock-in">
            <AdminRow
              icon={Route}
              label="Allow more time when the first stop is far"
              sub="Late first visit and the score both use the later deadline"
              control={<AdminSwitch on={settings.firstVisitFar.enabled} label="Far first visit window" onToggle={() => patch({ firstVisitFar: { ...settings.firstVisitFar, enabled: !settings.firstVisitFar.enabled } })} />}
            />
            {settings.firstVisitFar.enabled && (
              <>
                <AdminRow
                  icon={Route}
                  label="Far means more than"
                  sub="From where they clocked in to the first customer"
                  control={<Stepper label="Far first visit distance" value={settings.firstVisitFar.km} step={5} min={1} max={200} format={(v) => `${v} km`} onChange={(v) => patch({ firstVisitFar: { ...settings.firstVisitFar, km: v } })} />}
                />
                <AdminRow
                  icon={Timer}
                  label="Extra time before it is late"
                  sub="Added to the first-visit deadline"
                  control={<Stepper label="Far first visit extra time" value={settings.firstVisitFar.extraMin} step={5} min={0} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ firstVisitFar: { ...settings.firstVisitFar, extraMin: v } })} />}
                />
              </>
            )}
          </AdminGroup>
          <AdminGroup title="Idle gaps after a long drive">
            <AdminRow
              icon={PauseCircle}
              label="Allow more time after a long drive"
              sub="The idle limit grows with the distance between two visits. The manager alert has no live position, so it keeps the normal limit"
              control={<AdminSwitch on={settings.idleFar.enabled} label="Idle limit by distance" onToggle={() => patch({ idleFar: { ...settings.idleFar, enabled: !settings.idleFar.enabled } })} />}
            />
            {settings.idleFar.enabled && (
              <>
                <AdminRow
                  icon={Route}
                  label="Applies when the drive is over"
                  sub="From the last check-out to the next check-in"
                  control={<Stepper label="Idle far distance" value={settings.idleFar.km} step={5} min={1} max={200} format={(v) => `${v} km`} onChange={(v) => patch({ idleFar: { ...settings.idleFar, km: v } })} />}
                />
                <AdminRow
                  icon={Timer}
                  label="Window"
                  sub="The limit is this plus the minutes below; never shorter than the normal limit, and lunch can make it longer"
                  control={<Stepper label="Idle far window" value={settings.idleFar.windowMin} step={5} min={0} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ idleFar: { ...settings.idleFar, windowMin: v } })} />}
                />
                <AdminRow
                  icon={Timer}
                  label="Plus for every full"
                  sub="Distance step"
                  control={<Stepper label="Idle far step" value={settings.idleFar.stepKm} step={5} min={1} max={200} format={(v) => `${v} km`} onChange={(v) => patch({ idleFar: { ...settings.idleFar, stepKm: v } })} />}
                />
                <AdminRow
                  icon={Timer}
                  label="Add"
                  sub="Minutes added for each step"
                  control={<Stepper label="Idle far minutes per step" value={settings.idleFar.minPerStep} step={5} min={0} max={240} format={(v) => `${v} min`} onChange={(v) => patch({ idleFar: { ...settings.idleFar, minPerStep: v } })} />}
                />
              </>
            )}
          </AdminGroup>
          {lunchInvalid && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">The lunch window must end after it starts.</p>}
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
            <button type="button" onClick={save} disabled={saving || windowInvalid || lunchInvalid} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white shadow-lg disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}

      <LocationFormSheet open={form !== null} mode={form?.mode ?? 'create'} location={form?.location ?? null} onClose={() => setForm(null)} onSaved={() => refresh()} />
    </AdminFrame>
  )
}
