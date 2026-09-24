import { useState } from 'react'
import { leaveErrorMessage, leaveService } from './leaveService'
import type { LeaveBalanceSummary } from './types'

interface Person {
  id: string
  name: string
}

/** HR/Super Admin only -- set each person's Annual/Sick quota for the given year. Unpaid has no quota to set (always uncapped). */
export function LeaveBalancesAdmin({ people, balances, year, onChanged }: { people: Person[]; balances: LeaveBalanceSummary[]; year: number; onChanged: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        <span>Name</span>
        <span>Annual</span>
        <span>Sick</span>
      </div>
      {people.map((p) => (
        <BalanceRow
          key={p.id}
          person={p}
          annual={balances.find((b) => b.user_id === p.id && b.leave_type === 'annual')?.quota_days ?? 0}
          sick={balances.find((b) => b.user_id === p.id && b.leave_type === 'sick')?.quota_days ?? 0}
          year={year}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

function BalanceRow({
  person,
  annual,
  sick,
  year,
  onChanged,
}: {
  person: Person
  annual: number
  sick: number
  year: number
  onChanged: () => void
}) {
  const [annualInput, setAnnualInput] = useState(String(annual))
  const [sickInput, setSickInput] = useState(String(sick))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = Number(annualInput) !== annual || Number(sickInput) !== sick

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (Number(annualInput) !== annual) await leaveService.setLeaveBalance(person.id, 'annual', year, Number(annualInput))
      if (Number(sickInput) !== sick) await leaveService.setLeaveBalance(person.id, 'sick', year, Number(sickInput))
      onChanged()
    } catch (e) {
      setError(leaveErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-neutral-50 px-4 py-2.5 last:border-0">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
        <span className="truncate text-sm font-medium text-neutral-800">{person.name}</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={annualInput}
          onChange={(e) => setAnnualInput(e.target.value)}
          className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-right text-sm outline-none focus:border-brand-400"
        />
        <input
          type="number"
          min={0}
          step={0.5}
          value={sickInput}
          onChange={(e) => setSickInput(e.target.value)}
          className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-right text-sm outline-none focus:border-brand-400"
        />
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white tap-target disabled:opacity-40"
          >
            {saving ? '…' : 'Save'}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
    </div>
  )
}
