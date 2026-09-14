import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Shared bottom-sheet shell for selection/confirmation flows (spec: "Bottom sheets for selection where useful"). */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  // Stays mounted slightly past `open` going false, so the close animation
  // (translate/opacity back to their starting values) has time to play
  // before the sheet actually leaves the DOM -- otherwise it would just
  // vanish instantly, same as before this component had any transition.
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Next frame, so "closed" styles paint first -- changing the class
      // in the same tick as mounting can get coalesced by the browser and
      // skip the transition entirely.
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    // Matches the sheet's own transition-duration below -- shortening one
    // without the other either cuts the slide-down off early or leaves a
    // dead gap before the sheet actually unmounts.
    const timeout = setTimeout(() => setMounted(false), 280)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!mounted) return null

  // Portaled straight to <body> -- rendered inline, this "fixed" overlay
  // would sit inside AppLayout's per-page `animate-fade-in-up` wrapper,
  // and that animation's `transform` (present even at rest, since the
  // animation fill-mode is `both`) makes it the containing block for any
  // `position: fixed` descendant per the CSS spec. That silently shrank
  // the sheet down to that wrapper's own content box instead of the full
  // viewport -- barely visible on a tall page, but on a short one (e.g.
  // Users) it clipped most of the sheet's fields away entirely.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-[280ms] md:items-center ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative w-full max-w-lg rounded-t-2xl bg-white shadow-card transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] safe-bottom md:rounded-2xl ${
          visible ? 'translate-y-0 md:scale-100' : 'translate-y-full md:translate-y-0 md:scale-95'
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 tap-target">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  )
}
