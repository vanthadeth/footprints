const handlers: (() => void)[] = []

/**
 * Something open over the page (a sheet) that Back should close first.
 * Returns the unregister function. The newest one wins.
 */
export function pushBackHandler(fn: () => void): () => void {
  handlers.push(fn)
  return () => {
    const i = handlers.lastIndexOf(fn)
    if (i >= 0) handlers.splice(i, 1)
  }
}

/** The newest open back handler, if any (the field app's history guard calls it on Back). */
export function topBackHandler(): (() => void) | undefined {
  return handlers[handlers.length - 1]
}
