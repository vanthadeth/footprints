import type { ReactNode } from 'react'

/**
 * A desktop page body: full width up to 1440px, with optional actions on the
 * right of a heading row and an optional right-hand column (`aside`).
 */
export function DesktopPage({
  heading,
  actions,
  aside,
  children,
  className = '',
}: {
  heading?: string
  actions?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-8 py-6 ${className}`}>
      {(heading || actions) && (
        <div className="mb-5 flex items-center justify-between gap-4">
          {heading ? <h2 className="text-lg font-bold text-neutral-900">{heading}</h2> : <span />}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {aside ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">{children}</div>
          <aside className="min-w-0 space-y-4">{aside}</aside>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
