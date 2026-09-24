import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { haptic } from '@/lib/haptic'
import { isSlideConfirmed, slideProgress } from './slideToConfirm'

interface Props {
  label: string
  onConfirm: () => void
  variant?: 'primary' | 'danger'
  disabled?: boolean
  busy?: boolean
}

const KNOB = 56
const PAD = 4

/**
 * Uber-driver-style "slide to …" control for actions that shouldn't fire
 * from a stray tap in a pocket (Clock In / Clock Out). A drag past
 * SLIDE_CONFIRM_THRESHOLD confirms; a short drag springs back. Keyboard
 * users confirm with Enter/Space on the focused knob.
 */
export function SlideToConfirm({ label, onConfirm, variant = 'primary', disabled = false, busy = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const inactive = disabled || busy

  const travel = () => (trackRef.current ? trackRef.current.clientWidth - KNOB - PAD * 2 : 0)

  function confirm() {
    haptic('medium')
    onConfirm()
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (inactive) return
    startX.current = e.clientX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (startX.current === null || !trackRef.current) return
    setProgress(slideProgress(e.clientX - startX.current, trackRef.current.clientWidth, KNOB, PAD))
  }

  function onPointerUp() {
    if (startX.current === null) return
    startX.current = null
    setDragging(false)
    if (isSlideConfirmed(progress)) {
      setProgress(1)
      confirm()
      // Spring back once the parent has had a chance to swap state.
      window.setTimeout(() => setProgress(0), 400)
    } else {
      setProgress(0)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (inactive) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      confirm()
    }
  }

  const danger = variant === 'danger'
  return (
    <div
      ref={trackRef}
      className={`relative flex h-16 select-none items-center rounded-full p-1 ${
        danger ? 'bg-status-danger/10 dark:bg-status-danger/20' : 'bg-brand-500'
      } ${inactive ? 'opacity-60' : ''}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-[15px] font-bold ${
          danger ? 'text-status-danger dark:text-red-300' : 'text-white'
        }`}
        style={{ opacity: 1 - progress * 1.4 }}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={label}
        disabled={inactive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        style={{ transform: `translateX(${progress * travel()}px)`, touchAction: 'none' }}
        className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-md ${
          dragging ? '' : 'transition-transform duration-300 ease-out'
        } ${danger ? 'text-status-danger' : 'text-brand-500'}`}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <ChevronRight className="h-6 w-6" strokeWidth={2.6} aria-hidden />}
      </button>
    </div>
  )
}
