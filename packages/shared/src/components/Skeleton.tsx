/** A grey shimmering placeholder block. */
export function Bone({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block rounded-lg ${className}`} />
}

function CardBones({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <Bone className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bone className="h-3.5 w-2/3" />
          <Bone className="h-3 w-1/3" />
        </div>
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`mt-3 h-3 ${i % 2 ? 'w-4/5' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** A screen's content while its code or first data loads: a summary card and a few list cards. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3 md:max-w-3xl md:px-8">
      <div className="rounded-[20px] border border-neutral-100 bg-white p-4 shadow-card">
        <Bone className="h-3 w-24" />
        <Bone className="mt-3 h-8 w-32" />
        <Bone className="mt-4 h-5 w-full rounded-[4px]" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Bone className="h-9" />
          <Bone className="h-9" />
          <Bone className="h-9" />
        </div>
      </div>
      <Bone className="h-3 w-28" />
      <CardBones />
      <CardBones lines={1} />
      <CardBones />
    </div>
  )
}

/**
 * The whole app shell while sign-in is being checked: the large title bar,
 * the page skeleton and the bottom tab bar (rail on desktop), so the app
 * looks ready the moment it opens.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-neutral-50 md:flex-row">
      <div aria-hidden className="hidden w-60 shrink-0 space-y-2 border-r border-neutral-200 bg-white p-3 pt-4 md:block dark:border-neutral-800">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div aria-hidden style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }} className="px-4 pb-3 md:px-8">
          <div className="flex h-11 items-center justify-between">
            <Bone className="h-3 w-28" />
            <div className="flex gap-2">
              <Bone className="h-9 w-9 rounded-full" />
              <Bone className="h-10 w-10 rounded-full" />
            </div>
          </div>
          <Bone className="mt-1 h-8 w-40" />
        </div>
        <PageSkeleton />
      </div>
      <div
        aria-hidden
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="fixed inset-x-0 bottom-0 grid h-[calc(4.75rem+env(safe-area-inset-bottom))] grid-cols-5 items-start border-t border-neutral-200 bg-white px-1 pt-2 md:hidden dark:border-neutral-800"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="flex flex-col items-center gap-1.5">
            {i === 2 ? <Bone className="-mt-5 h-14 w-14 rounded-full" /> : <Bone className="h-6 w-6 rounded-md" />}
            <Bone className="h-2 w-10" />
          </span>
        ))}
      </div>
    </div>
  )
}
