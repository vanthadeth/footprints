/** A number tile as in the Weekly attendance view: bold grey label, big figure in the status colour, one grey line. */
export function Kpi({ label, value, sub, tone = 'text-neutral-900', className = '' }: { label: string; value: string; sub: string; tone?: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-card ${className}`}>
      <p className="text-xs font-bold text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="truncate text-xs text-neutral-500">{sub}</p>
    </div>
  )
}

/** A colour swatch and its meaning, for the line under the grid. */
export function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  )
}
