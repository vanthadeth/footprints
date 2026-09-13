import { WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

/**
 * A persistent, unmissable offline indicator. We never let a write appear
 * to succeed while offline (spec §46) -- this banner is the honest signal
 * that nothing typed right now will reach the server until it's gone.
 */
export function OfflineBanner() {
  const online = useNetworkStatus()
  if (online) return null

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex animate-slide-down items-center justify-center gap-2 bg-status-danger px-4 py-2 text-center text-xs font-medium text-white safe-top">
      <WifiOff className="h-3.5 w-3.5" />
      You're offline. Clock in/out and check in/out need a connection to save.
    </div>
  )
}
