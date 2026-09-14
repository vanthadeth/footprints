import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useAuth } from '@/features/auth/AuthContext'
import { locationService } from '@/features/location/locationService'
import { customersService } from './customersService'

/**
 * Quick-add for a customer met in the field, right before checking in with
 * them -- just enough to find them again (name, type, address), not a full
 * customer profile. Current GPS is captured silently in the background
 * (best-effort; a failed fix just leaves lat/lng null) so they show up in
 * the nearby-customers picker without extra typing.
 */
export function NewCustomerSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (customerId: string) => void
}) {
  const { session } = useAuth()
  const [shopName, setShopName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setShopName('')
    setBusinessType('')
    setStreetAddress('')
    setCoords(null)
    setError(null)
    locationService
      .getCurrentPosition()
      .then((reading) => setCoords({ latitude: reading.latitude, longitude: reading.longitude }))
      .catch(() => {
        // No GPS fix -- the customer still gets created, just without a
        // location, so they won't show up in the nearby picker until
        // someone edits them in with coordinates later.
      })
  }, [open])

  async function handleSave() {
    if (!session || !shopName.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const id = await customersService.quickCreate(session.user.id, {
        shopName: shopName.trim(),
        businessType: businessType.trim() || null,
        streetAddress: streetAddress.trim() || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      })
      onCreated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="New Customer">
      <div className="space-y-4 p-4">
        <div>
          <label htmlFor="shop-name" className="mb-1.5 block text-sm font-medium text-neutral-700">
            Shop Name
          </label>
          <input
            id="shop-name"
            autoFocus
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="e.g. Sokha Hardware"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label htmlFor="business-type" className="mb-1.5 block text-sm font-medium text-neutral-700">
            Business Type (optional)
          </label>
          <input
            id="business-type"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder="e.g. Hardware Store"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label htmlFor="street-address" className="mb-1.5 block text-sm font-medium text-neutral-700">
            Address (optional)
          </label>
          <input
            id="street-address"
            value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)}
            placeholder="Street, landmark…"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1.5 text-xs text-neutral-400">{coords ? 'Current location will be saved too.' : "Getting your location…"}</p>
        </div>

        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        <button
          onClick={handleSave}
          disabled={!shopName.trim() || saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving…' : 'Save Customer'}
        </button>
      </div>
    </BottomSheet>
  )
}
