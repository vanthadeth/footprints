import type { ReactNode } from 'react'

const INPUT =
  'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-neutral-500">{title}</h3>
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

export function TextInput({ value, onChange, type = 'text', placeholder, disabled }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  return <input type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
}

export function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} className={INPUT} />
}

export function Select({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder?: string; children: ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-500" />
      {label}
    </label>
  )
}

export function Notice({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  return <p className={`rounded-lg px-3 py-2 text-sm ${tone === 'error' ? 'bg-status-danger/10 text-status-danger' : 'bg-status-working/10 text-status-working'}`}>{children}</p>
}

export function PrimaryButton({ children, onClick, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">
      {children}
    </button>
  )
}
