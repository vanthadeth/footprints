import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'

/** Simple read-only info sheet, used by Menu items that just need to explain something (spec §43-44). */
export function InfoSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3 p-5 text-sm leading-relaxed text-neutral-600">{children}</div>
    </BottomSheet>
  )
}
