/** iOS-style on/off switch. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
        checked ? 'justify-end bg-status-working' : 'justify-start bg-neutral-300 dark:bg-neutral-600'
      }`}
    >
      <span className="h-[27px] w-[27px] rounded-full bg-white shadow" />
    </button>
  )
}
