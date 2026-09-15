import { useEffect, useState, type ReactNode } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useAuth } from '@/features/auth/AuthContext'
import { locationService } from '@/features/location/locationService'
import { haptic } from '@/lib/haptic'
import { locationsService, type WorkLocationRow } from './locationsService'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  location: WorkLocationRow | null
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_RADIUS_M = 150

/** Create-or-edit sheet for one work location -- same shell as UserFormSheet. */
export function LocationFormSheet({ open, mode, location, onClose, onSaved }: Props) {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radiusM, setRadiusM] = useState(String(DEFAULT_RADIUS_M))
  const [active, setActive] = useState(true)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(mode === 'edit' && location ? location.name : '')
    setLatitude(mode === 'edit' && location ? String(location.latitude) : '')
    setLongitude(mode === 'edit' && location ? String(location.longitude) : '')
    setRadiusM(mode === 'edit' && location ? String(location.radius_m) : String(DEFAULT_RADIUS_M))
    setActive(mode === 'edit' && location ? location.active : true)
  }, [open, mode, location])

  const latNum = Number(latitude)
  const lngNum = Number(longitude)
  const radiusNum = Number(radiusM)
  const canSave = name.trim() && latitude.trim() && longitude.trim() && Number.isFinite(latNum) && Number.isFinite(lngNum) && radiusNum > 0

  async function handleUseCurrentLocation() {
    setLocating(true)
    setError(null)
    try {
      const reading = await locationService.getCurrentPosition()
      setLatitude(reading.latitude.toFixed(6))
      setLongitude(reading.longitude.toFixed(6))
      haptic('success')
    } catch {
      setError('Could not get your current location. Enter coordinates manually.')
    } finally {
      setLocating(false)
    }
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const input = { name: name.trim(), latitude: latNum, longitude: lngNum, radiusM: radiusNum, active }
      if (mode === 'create') {
        if (!session) throw new Error('Not signed in.')
        await locationsService.create(session.user.id, input)
      } else if (location) {
        await locationsService.update(location.id, input)
      }
      haptic('success')
      onSaved()
      onClose()
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === 'create' ? 'New Location' : 'Edit Location'}>
      <div className="space-y-4 p-4">
        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Head Office, Warehouse 1"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
        </Field>

        <button
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 tap-target disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {locating ? 'Getting location…' : 'Use My Current Location'}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="11.5564"
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </Field>
          <Field label="Longitude">
            <input
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="104.9282"
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </Field>
        </div>

        <Field label="Radius" hint="How close a clock-in/out must be to count as this location.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={radiusM}
              onChange={(e) => setRadiusM(e.target.value)}
              className="w-24 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-900"
            />
            <span className="text-sm text-neutral-500">meters</span>
          </div>
        </Field>

        <Field label="Active" hint="Only active locations are matched at clock-in/out." inline>
          <Switch checked={active} onChange={setActive} />
        </Field>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create Location' : 'Save Changes'}
        </button>
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
