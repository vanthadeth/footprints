import type { Section } from '@/sections'

/** Placeholder for a section whose screens land in a later phase. */
export function SectionPage({ section }: { section: Section }) {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{section.label}</h1>
      <p className="mt-1 text-sm text-neutral-500">{section.description}</p>
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Coming next</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-500">
          {section.planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
