import { useState } from 'react'
import { MapPin, RefreshCw } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { locationService } from './locationService'
import { LocationError } from './types'
import { haptic } from '@/lib/haptic'

/**
 * Explains why Footprints needs location (spec §44) and lets the user
 * retry the permission prompt on demand -- never silently proceeds without
 * a real reading.
 */
export function LocationPermissionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'granted' | 'denied' | 'unavailable'>('idle')

  async function retry() {
    setStatus('checking')
    try {
      await locationService.getCurrentPosition()
      setStatus('granted')
      haptic('success')
    } catch (e) {
      if (e instanceof LocationError) {
        setStatus(e.status === 'permission_denied' ? 'denied' : 'unavailable')
      } else {
        setStatus('unavailable')
      }
      haptic('error')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Location Access">
      <div className="p-5">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <MapPin className="h-6 w-6" />
        </div>
        <p className="text-sm leading-relaxed text-neutral-600">
          Footprints uses your location to record customer visits, monitor your active visit, and provide accurate
          journey information. Location is only recorded when you Clock In, Clock Out, Check In, or Check Out, and
          periodically while a visit is active.
        </p>

        {status === 'denied' && (
          <div className="mt-4 rounded-lg bg-status-danger/10 px-3 py-2.5 text-sm text-status-danger">
            Location access required. Please enable it in your browser or device settings, then retry.
          </div>
        )}
        {status === 'unavailable' && (
          <div className="mt-4 rounded-lg bg-status-warn/10 px-3 py-2.5 text-sm text-status-warn">
            Location is currently unavailable. Please try again.
          </div>
        )}
        {status === 'granted' && (
          <div className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">Location access is working.</div>
        )}

        <button
          onClick={retry}
          disabled={status === 'checking'}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white tap-target disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
          {status === 'checking' ? 'Checking…' : 'Check Location Access'}
        </button>
      </div>
    </BottomSheet>
  )
}
