import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon
  title: string
  body?: string
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-medium text-neutral-700">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-neutral-500">{body}</p>}
    </div>
  )
}
