import type { ReactNode } from 'react'

/** A list on the left and the selected item's detail on the right, each scrolling on its own below the top bar. */
export function SplitView({ list, detail, empty }: { list: ReactNode; detail: ReactNode | null; empty?: ReactNode }) {
  return (
    <div className="grid h-[calc(100dvh-4rem)] grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div className="overflow-y-auto border-r border-neutral-200 bg-white dark:border-neutral-800">{list}</div>
      <div className="overflow-y-auto">{detail ?? empty ?? null}</div>
    </div>
  )
}
