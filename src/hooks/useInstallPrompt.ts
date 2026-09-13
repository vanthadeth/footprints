import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own flag -- it never fires beforeinstallprompt at all.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * Wraps the browser's install flow (Chrome/Edge/Android fire
 * `beforeinstallprompt`; iOS Safari never does, so there's nothing to
 * capture there -- see `isIos` for showing manual instructions instead).
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredEvent(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferredEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  return {
    /** True once Chrome/Edge/Android has told us the app is installable. */
    canInstall: deferredEvent != null && !installed,
    /** iOS never fires the event above -- show "Add to Home Screen" instructions instead when this is true. */
    needsIosInstructions: isIos && !installed && deferredEvent == null,
    installed,
    async promptInstall() {
      if (!deferredEvent) return
      await deferredEvent.prompt()
      const { outcome } = await deferredEvent.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferredEvent(null)
    },
  }
}
