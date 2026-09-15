import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Edge-to-edge full-viewport overlay -- for content (a map) that wants
 * every pixel it can get, unlike BottomSheet's card-with-margins. Just a
 * floating close button over the content, same portal-to-<body> reasoning
 * as BottomSheet (an inline "fixed" here would otherwise be clipped to
 * AppLayout's own animated wrapper) and the same mount/unmount timing so
 * the fade has time to play before it leaves the DOM.
 */
export function FullScreenSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
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

  return createPortal(
    <div
      className={`fixed inset-0 z-50 bg-neutral-50 transition-opacity duration-[280ms] dark:bg-neutral-950 ${visible ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0">{children}</div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
        className="fixed right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-600 shadow-card backdrop-blur tap-target dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body
  )
}
