import { ShoppingCart, UserPlus, Users } from 'lucide-react'
import { money } from './roster'
import type { Measure, Performance } from './teamOverview'

interface Props {
  performance: Performance
  /** Small text on the right of the title. */
  period?: string
  className?: string
}

function Tile({ icon, label, m, note, aria }: { icon: React.ReactNode; label: string; m: Measure; note: string; aria: string }) {
  return (
    <div className="tpf-m">
      <div className="tpf-mh">
        <span className="tpf-ic" aria-hidden="true">{icon}</span>
        <span className="tpf-mt">{label}</span>
        {m.percent != null && <span className="tpf-mp">{m.percent}%</span>}
      </div>
      <div className="tpf-mv">
        <b>{m.value}</b>
        {m.target != null && <span>of {m.target}</span>}
      </div>
      {m.target != null && (
        <span className="tpf-pb" role="img" aria-label={aria}>
          <i style={{ width: `${m.fill}%` }} />
        </span>
      )}
      <small>{m.target != null ? note : 'No target set'}</small>
    </div>
  )
}

/**
 * Team performance for the day: sales against the target, then visits and new customers. Pace is left to the monthly report.
 */
export function TeamPerformance({ performance: p, period = 'Today', className = '' }: Props) {
  const s = p.sales
  return (
    <section className={`tpf ${className}`.trim()} aria-label="Team performance">
      <div className="tpf-h">
        <span className="tpf-t">Team performance</span>
        <span className="tpf-s">{period}</span>
      </div>
      <div className="tpf-sec">
        <span className="tpf-sl">
          <ShoppingCart size={16} strokeWidth={2} aria-hidden="true" /> Sales vs target
        </span>
        <span className="tpf-s">{s.target != null ? `Target ${money(s.target)}` : 'No target set'}</span>
      </div>
      <div className="tpf-big">
        <span className="tpf-n">{money(s.value)}</span>
        {s.percent != null && <span className="tpf-pc">{s.percent}% of target</span>}
      </div>
      {s.target != null && (
        <div className="tpf-bar" role="img" aria-label={`Team sales ${s.percent} percent of target`}>
          <div className="tpf-fill" style={{ width: `${s.fill}%` }} />
        </div>
      )}
      <div className="tpf-pair">
        <Tile icon={<Users size={18} strokeWidth={2} />} label="Visits" m={p.visits} note="Visits today" aria={`Team visits ${p.visits.percent} percent of target`} />
        <Tile icon={<UserPlus size={18} strokeWidth={2} />} label="New" m={p.newCustomers} note="Opened today" aria={`New customers ${p.newCustomers.percent} percent of target`} />
      </div>
    </section>
  )
}
