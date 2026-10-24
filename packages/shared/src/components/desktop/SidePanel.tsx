import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useBackHandler } from '../../hooks/useBackHandler'

/** A right-hand drawer for desktop forms and details (what BottomSheet is on the phone). Portaled to <body> for the same reason BottomSheet is. */
export function SidePanel({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  useBackHandler(open, onClose)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const timeout = setTimeout(() => setMounted(false), 240)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`absolute inset-0 bg-black/30 transition-opacity duration-[240ms] ${visible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full ${width} flex-col bg-white shadow-card transition-transform duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-100 px-6">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}
