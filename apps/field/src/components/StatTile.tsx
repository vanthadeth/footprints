export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl2 bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
  )
}
