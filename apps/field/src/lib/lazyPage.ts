import { lazy, type ComponentType } from 'react'

const loaders: (() => Promise<unknown>)[] = []

/** React.lazy that also remembers the import, so prefetchPages can warm every screen's code in the background. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  loaders.push(load)
  return lazy(load)
}

let started = false

/**
 * Once the app is idle after opening, fetch every lazy screen's code one at
 * a time, so moving between screens never waits on a download. The service
 * worker keeps the files, so after the first visit this reads from the cache.
 */
export function prefetchPages() {
  if (started || typeof window === 'undefined') return
  started = true
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500))
  const next = (i: number) => {
    if (i >= loaders.length) return
    loaders[i]()
      .catch(() => {})
      .finally(() => idle(() => next(i + 1)))
  }
  idle(() => next(0))
}
