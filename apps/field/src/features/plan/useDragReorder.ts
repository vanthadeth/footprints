import { useCallback, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { moveItem } from './planView'

/**
 * Pointer-drag reordering for a list whose rows carry `data-row-index`. The
 * grip gets `bind(index)`; moving over another row marks it as the drop
 * target and letting go calls `onMove(from, to)`. Buttons elsewhere keep
 * working for keyboards.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const ref = useRef(drag)
  ref.current = drag

  const bind = useCallback(
    (index: number) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ from: index, over: index })
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (!ref.current) return
        const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-row-index]')
        const over = row ? Number((row as HTMLElement).dataset.rowIndex) : ref.current.over
        if (over !== ref.current.over) setDrag({ from: ref.current.from, over })
      },
      onPointerUp: () => {
        const d = ref.current
        setDrag(null)
        if (d && d.from !== d.over) onMove(d.from, d.over)
      },
      onPointerCancel: () => setDrag(null),
    }),
    [onMove]
  )
  return { drag, bind }
}

export { moveItem }
