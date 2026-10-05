import type { ReactNode } from 'react'
import type { Direction, WorkLocation } from './permissionsService'
import type { ClockIds } from './permissionText'

/** Pill choice; `plain` drops the white fill for chips sitting on a grey panel. */
export function Chip({ active, onClick, children, muted, plain }: { active: boolean; onClick: () => void; children: ReactNode; muted?: boolean; plain?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-bold transition-colors tap-target ${
        active
          ? 'border-neutral-900 bg-white text-neutral-900 dark:border-neutral-100'
          : `${plain ? 'border-transparent bg-transparent' : 'border-neutral-200 bg-white dark:border-neutral-800'} ${muted ? 'text-neutral-400' : 'text-neutral-600'}`
      }`}
    >
      {children}
    </button>
  )
}

export function GroupCard({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-0.5 flex items-baseline justify-between text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
        <span>{title}</span>
        {trailing && <span className="font-semibold normal-case tracking-normal">{trailing}</span>}
      </div>
      <div className="divide-y divide-neutral-100 border-y border-neutral-100 dark:divide-neutral-800 dark:border-neutral-800">{children}</div>
    </section>
  )
}

/**
 * "Clock in at" / "Clock out at" pickers. value null = no rule of its own
 * (a person then follows their role); [] = anywhere.
 */
export function LocationPicker({
  value,
  onChange,
  locations,
  allowInherit,
  inheritLabel,
}: {
  value: ClockIds | Record<Direction, string[] | null>
  onChange: (dir: Direction, ids: string[] | null) => void
  locations: WorkLocation[]
  allowInherit?: boolean
  inheritLabel?: string
}) {
  const rows: { dir: Direction; label: string }[] = [
    { dir: 'in', label: 'Clock in at' },
    { dir: 'out', label: 'Clock out at' },
  ]
  return (
    <div className="mt-2.5 space-y-2 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
      {rows.map(({ dir, label }) => {
        const ids = value[dir]
        const shown = locations.filter((l) => l.active || ids?.includes(l.id))
        return (
          <div key={dir}>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">{label}</p>
            <div className="flex flex-wrap gap-1.5">
              {allowInherit && (
                <Chip plain active={ids === null} onClick={() => onChange(dir, null)}>
                  {inheritLabel ?? 'Use role'}
                </Chip>
              )}
              <Chip plain active={ids !== null && ids.length === 0} onClick={() => onChange(dir, [])}>
                Anywhere
              </Chip>
              {shown.map((l) => {
                const on = !!ids?.includes(l.id)
                return (
                  <Chip
                    plain
                    key={l.id}
                    active={on}
                    muted={!l.active}
                    onClick={() => onChange(dir, on ? (ids ?? []).filter((id) => id !== l.id) : [...(ids ?? []), l.id])}
                  >
                    {l.name}
                    {!l.active && ' (off)'}
                  </Chip>
                )
              })}
            </div>
          </div>
        )
      })}
      <p className="text-[11px] leading-snug text-neutral-500">
        Outside these places the clock button explains where to go and shows the nearest one. Add places in Work locations.
      </p>
    </div>
  )
}

export function SaveBar({ count, saving, onSave, onDiscard }: { count: number; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 px-4 md:bottom-6 md:left-56">
      <div className="mx-auto flex max-w-lg gap-2 md:max-w-2xl">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="h-12 rounded-2xl bg-white px-4 text-[15px] font-bold text-neutral-600 shadow-lg tap-target disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[15px] font-bold text-white shadow-lg tap-target disabled:opacity-50"
        >
          {saving ? 'Saving…' : `Save ${count} change${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

export function Avatar({ name, className = '' }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-white ${className}`}>{initials || '?'}</span>
  )
}
