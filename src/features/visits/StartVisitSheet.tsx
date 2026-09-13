import { useEffect, useState } from 'react'
import { Building2, MapPin } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { locationService } from '@/features/location/locationService'
import { LocationError } from '@/features/location/types'
import { formatDistance } from '@/lib/geo'
import { visitsService, type NearbyCustomer } from './visitsService'

/**
 * Start Visit flow. There is NO geofence here -- nearby customers are only
 * a convenience sort, and "Continue Without Customer" is always available
 * (spec §18-20).
 */
export function StartVisitSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (customerId: string | null) => void
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [customers, setCustomers] = useState<NearbyCustomer[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setState('loading')
    setErrorMessage(null)

    locationService
      .getCurrentPosition()
      .then(async (reading) => {
        setAccuracy(reading.accuracy)
        const nearby = await visitsService.nearbyCustomers(reading.latitude, reading.longitude)
        setCustomers(nearby)
        setState('ready')
      })
      .catch((e) => {
        setErrorMessage(
          e instanceof LocationError && e.status === 'permission_denied'
            ? 'Location access is required to see nearby customers, but you can still continue without one.'
            : 'Could not get your location right now, but you can still continue without a customer.'
        )
        setState('error')
      })
  }, [open])

  return (
    <BottomSheet open={open} onClose={onClose} title="Start Visit">
      <div className="p-4">
        {state === 'loading' && (
          <div className="space-y-2 py-6">
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl bg-neutral-100" />
          </div>
        )}

        {state !== 'loading' && (
          <>
            {accuracy != null && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-neutral-500">
                <MapPin className="h-3.5 w-3.5" /> Current location · GPS accuracy: {Math.round(accuracy)} m
              </p>
            )}
            {errorMessage && <p className="mb-3 text-xs text-status-warn">{errorMessage}</p>}

            {customers.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Nearby Customers</p>
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 text-left shadow-card tap-target"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">{c.shop_name}</p>
                      <p className="truncate text-xs text-neutral-500">{c.business_type}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-neutral-500">{formatDistance(c.distance_m)}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => onSelect(null)}
              className="w-full rounded-xl border border-dashed border-neutral-300 py-3.5 text-sm font-semibold text-neutral-600 tap-target"
            >
              Continue Without Customer
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
