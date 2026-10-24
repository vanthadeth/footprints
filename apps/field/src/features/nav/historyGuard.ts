import type { createBrowserRouter } from 'react-router-dom'
import { appBack } from './backNav'
import { topBackHandler } from '@footprints/shared/lib/backHandlers'

export { pushBackHandler } from '@footprints/shared/lib/backHandlers'

type Nav = { tabs: string[]; home: string } | null
type AppRouter = ReturnType<typeof createBrowserRouter>

let nav: Nav = null

/** The person's tabs and home tab, once known (AppLayout sets them); until then tab roots fall back to their Hub parent. */
export function setBackNav(next: Nav) {
  nav = next
}

const historyIdx = () => (window.history.state as { idx?: number } | null)?.idx ?? 0

/**
 * Takes over the browser's Back and Forward buttons (and the phone's back
 * gesture). Forward does nothing. Back closes an open sheet if there is one,
 * otherwise goes where the app says Back goes from this screen (see
 * appBack) -- never to whatever page happened to be before in the browser's
 * history, and never out of the app: an extra entry is kept behind the first
 * page so there is always a Back for the app to catch.
 */
export function installHistoryGuard(router: AppRouter): () => void {
  let prev = router.state.location
  let lastIdx = historyIdx()
  if (lastIdx === 0) {
    // A copy of the first page on top, so Back from it lands here instead of leaving the site.
    void router.navigate(prev.pathname + prev.search + prev.hash, { replace: false, state: prev.state })
  }
  return router.subscribe((state) => {
    const idx = historyIdx()
    if (state.historyAction !== 'POP' || state.navigation.state !== 'idle') {
      if (state.navigation.state === 'idle') {
        prev = state.location
        lastIdx = idx
      }
      return
    }
    const from = prev
    const here = from.pathname + from.search + from.hash
    if (idx > lastIdx) {
      // Forward: stay where we were.
      void router.navigate(here, { replace: true, state: from.state })
      return
    }
    // Back. At the very first entry, push instead of replace so there is still an entry behind us.
    const replace = idx > 0
    const sheet = topBackHandler()
    if (sheet) {
      sheet()
      void router.navigate(here, { replace, state: from.state })
      return
    }
    const target = appBack(from.pathname, from.search, nav)
    void router.navigate(target ?? here, { replace, state: target ? undefined : from.state })
  })
}
