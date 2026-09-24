import { useMemo, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useCustomers } from '@/features/customers/useCustomers'
import { useFleetHistory } from '@/features/reports/useFleetHistory'
import { CUSTOMER_DUE_AFTER_DAYS, APP_TIMEZONE } from '@/lib/config'
import { getPresetRange, todayDateString } from '@/lib/dateRange'
import type { TeamMember } from '../types'
import { classifyCoverage, type CoverageStatus } from './customerCoverage'

type Period = 'today' | 'this_week' | 'this_month'

const STATUS: Record<CoverageStatus, { label: string; color: string; glyph?: string }> = {
  visited: { label: 'Visited', color: '#0f6e4f', glyph: '✓' },
  unvisited: { label: 'Not visited', color: '#8991a3' },
  overdue: { label: 'Overdue', color: '#c23b3b', glyph: '!' },
}

const LIST_LIMIT = 20

function dateInZone(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** Which customers the team has visited in the period, which not yet, and which are overdue -- as pins plus a "needs a visit" list. */
export function CustomersMap({ team }: { team: TeamMember[] }) {
  const [period, setPeriod] = useState<Period>('this_week')
  const [show, setShow] = useState<Record<CoverageStatus, boolean>>({ visited: true, unvisited: true, overdue: true })
  const range = useMemo(() => getPresetRange(period), [period])
  const { customers, loading: customersLoading } = useCustomers()
  const { visits, loading: visitsLoading } = useFleetHistory(
    team.map((m) => m.id),
    range
  )

  const located = useMemo(() => customers.filter((c) => c.status === 'active' && c.latitude != null && c.longitude != null), [customers])
  const coverage = useMemo(() => {
    const visited = new Set<string>()
    const latest: Record<string, string> = {}
    for (const v of visits) {
      if (v.cancelled_at || !v.customer_id) continue
      visited.add(v.customer_id)
      const d = dateInZone(v.checked_in_at)
      if (!latest[v.customer_id] || latest[v.customer_id] < d) latest[v.customer_id] = d
    }
    return classifyCoverage(
      located.map((c) => ({ id: c.id!, lastVisitDate: c.last_visit_date })),
      visited,
      latest,
      todayDateString(),
      CUSTOMER_DUE_AFTER_DAYS
    )
  }, [visits, located])

  const counts = { visited: 0, unvisited: 0, overdue: 0 }
  for (const c of located) counts[coverage[c.id!]?.status ?? 'unvisited'] += 1
  const total = located.length || 1
  const pins = located.filter((c) => show[coverage[c.id!]?.status ?? 'unvisited'])
  const needs = located
    .filter((c) => coverage[c.id!]?.status !== 'visited')
    .sort((a, b) => {
      const ca = coverage[a.id!]
      const cb = coverage[b.id!]
      if (ca.status !== cb.status) return ca.status === 'overdue' ? -1 : 1
      return (cb.daysSince ?? 9999) - (ca.daysSince ?? 9999)
    })
  const loading = customersLoading || visitsLoading

  return (
    <div className="space-y-3">
      <SegmentedControl
        ariaLabel="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'this_week', label: 'This week' },
          { value: 'this_month', label: 'This month' },
        ]}
      />

      {pins.length > 0 ? (
        <MapView points={pins.map((c) => [c.latitude!, c.longitude!])} height={340}>
          {pins.map((c) => {
            const cov = coverage[c.id!]
            const st = STATUS[cov.status]
            return (
              <Marker key={c.id} position={[c.latitude!, c.longitude!]} icon={pinIcon(st.color, { size: 26, label: st.glyph })} zIndexOffset={cov.status === 'overdue' ? 500 : 0}>
                <Popup>
                  <div className="space-y-0.5 text-sm">
                    <p className="font-bold">{c.shop_name}</p>
                    <p className="text-neutral-600">
                      {st.label} · {cov.daysSince === null ? 'never visited' : cov.daysSince === 0 ? 'visited today' : `last visit ${cov.daysSince} days ago`}
                    </p>
                    {c.owner_name && <p className="text-xs text-neutral-500">Owner: {c.owner_name}</p>}
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapView>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-xl2 bg-neutral-100 text-sm text-neutral-500">
          {loading ? 'Loading customers…' : 'No customers with a location to show'}
        </div>
      )}

      <div className="space-y-2.5 rounded-2xl bg-white p-3.5 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-extrabold text-neutral-900">
            {counts.visited} of {located.length} customers visited
          </span>
          <span className="text-xs text-neutral-500">{range.label}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100">
          {(['visited', 'unvisited', 'overdue'] as const).map((k) => (
            <span key={k} style={{ width: `${(counts[k] / total) * 100}%`, backgroundColor: STATUS[k].color }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['visited', 'unvisited', 'overdue'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={show[k]}
              onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
              className={`flex h-8 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-xs font-bold text-neutral-800 ${
                show[k] ? 'border-neutral-300 bg-white' : 'border-neutral-200 bg-neutral-100 opacity-60'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS[k].color }} />
              {STATUS[k].label} · {counts[k]}
            </button>
          ))}
        </div>
      </div>

      <h3 className="px-0.5 text-[15px] font-extrabold text-neutral-900">Needs a visit</h3>
      <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
        {needs.slice(0, LIST_LIMIT).map((c) => {
          const cov = coverage[c.id!]
          const overdue = cov.status === 'overdue'
          return (
            <div key={c.id} className="flex items-center gap-3 px-3.5 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS[cov.status].color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-neutral-900">{c.shop_name}</p>
                <p className={`text-xs ${overdue ? 'font-semibold text-status-danger' : 'text-neutral-500'}`}>
                  {cov.daysSince === null ? 'Never visited' : `Last visit ${cov.daysSince} days ago`}
                  {c.owner_name ? ` · ${c.owner_name}` : ''}
                </p>
              </div>
            </div>
          )
        })}
        {needs.length === 0 && <p className="px-4 py-6 text-center text-sm text-neutral-500">{loading ? 'Loading…' : 'Every customer has been visited.'}</p>}
        {needs.length > LIST_LIMIT && <p className="px-4 py-2.5 text-center text-xs text-neutral-500">+ {needs.length - LIST_LIMIT} more</p>}
      </div>
    </div>
  )
}
