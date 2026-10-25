import { ShoppingCart, UserPlus, Users } from 'lucide-react'
import { money } from './roster'
import type { Measure, Performance } from './teamOverview'

interface Props {
  performance: Performance
  /** Small text on the right of the title. */
  period?: string
  className?: string
}

function Tile({ icon, label, m, month, note, aria }: { icon: React.ReactNode; label: string; m: Measure; month?: Measure; note: string; aria: string }) {
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
      {month && (
        <>
          <div className="tpf-tm">
            <span>This month</span>
            <b>
              {month.value}
              {month.target != null && <em> / {month.target}</em>}
            </b>
          </div>
          {month.target != null && (
            <span className="tpf-pb tpf-sm" role="img" aria-label={`${label} this month ${month.percent} percent of target`}>
              <i style={{ width: `${month.fill}%` }} />
            </span>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Team performance: today's sales against the target, the month's sales with its pace (green on or ahead of pace, amber
 * slightly behind, red well behind), then visits and new customers with their month underneath. Pace is for the month only.
 */
export function TeamPerformance({ performance: p, period = 'Today', className = '' }: Props) {
  const s = p.sales
  const mo = p.month
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
      {mo && (
        <div className="tpf-mo">
          <div className="tpf-sec">
            <span className="tpf-sl">Sales this month</span>
            <span className="tpf-mn">
              {money(mo.sales.value)}
              {mo.sales.target != null && <span> / {money(mo.sales.target)}</span>}
            </span>
          </div>
          {mo.sales.target != null && (
            <div className="tpf-bar tpf-mb" role="img" aria-label={`Team sales this month ${mo.sales.percent} percent of target`}>
              <div className={`tpf-fill tpf-${mo.sales.tone ?? 'ok'}`} style={{ width: `${mo.sales.fill}%` }} />
              {mo.sales.pace != null && <div className="tpf-mark" style={{ left: `${mo.sales.pace}%` }} />}
            </div>
          )}
          <div className="tpf-cap">
            <span className={`tpf-chip ${mo.sales.tone ?? 'plain'}`}>{mo.sales.chip}</span>
            <span className="tpf-note">
              {mo.sales.percent != null ? `${mo.sales.percent}% · ` : ''}
              {mo.daysLeft} working {mo.daysLeft === 1 ? 'day' : 'days'} left
            </span>
          </div>
        </div>
      )}
      <div className="tpf-pair">
        <Tile icon={<Users size={18} strokeWidth={2} />} label="Visits" m={p.visits} month={mo?.visits} note="Visits today" aria={`Team visits ${p.visits.percent} percent of target`} />
        <Tile icon={<UserPlus size={18} strokeWidth={2} />} label="New" m={p.newCustomers} month={mo?.newCustomers} note="Opened today" aria={`New customers ${p.newCustomers.percent} percent of target`} />
      </div>
    </section>
  )
}
