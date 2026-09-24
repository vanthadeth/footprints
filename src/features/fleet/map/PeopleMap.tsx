import { useMemo, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import { MapView } from '@/features/maps/MapView'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { displayName } from '@/lib/displayName'
import { formatTime } from '@/lib/datetime'
import { FLEET_STATUS_LABELS } from '../FleetStatusBadge'
import type { FleetMemberSnapshot, FleetStatus } from '../types'
import { personIcon } from './mapIcons'
import { ageLabel, isStale, minutesSince } from './lastKnown'

const COLOR: Record<FleetStatus, string> = { VISITING: '#6552c9', IDLING: '#96703f', OFF: '#8a8f98' }
type Filter = 'all' | FleetStatus

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Everyone's last known location (from their latest clock or visit point), coloured by status, with how long ago it was. */
export function PeopleMap({ snapshots, onShowRoute }: { snapshots: FleetMemberSnapshot[]; onShowRoute: (userId: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const customerNames = useCustomerNames(snapshots.map((s) => s.openVisit?.customer_id ?? null))
  const now = Date.now()

  const rows = useMemo(
    () =>
      snapshots
        .map((s) => {
          const minutes = s.lastLocation ? minutesSince(s.lastLocation.at, now) : null
          return { s, minutes, stale: minutes !== null && isStale(s.status, minutes) }
        })
        .sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity)),
    [snapshots, now]
  )
  const shown = rows.filter((r) => filter === 'all' || r.s.status === filter)
  const located = shown.filter((r) => r.s.lastLocation)

  function place(s: FleetMemberSnapshot): string {
    if (s.status === 'VISITING') {
      const id = s.openVisit?.customer_id
      return id ? customerNames[id] ?? 'At a customer' : 'Unassigned visit'
    }
    if (s.status === 'OFF') return s.attendance?.clock_out_at ? `Clocked out ${formatTime(s.attendance.clock_out_at)}` : 'Not clocked in'
    return s.lastLocation ? `Between visits · last point ${formatTime(s.lastLocation.at)}` : 'Between visits'
  }

  const filters: { key: Filter; label: string; dot: string }[] = [
    { key: 'all', label: 'All', dot: '#1668b8' },
    { key: 'VISITING', label: 'Visiting', dot: COLOR.VISITING },
    { key: 'IDLING', label: 'Idling', dot: COLOR.IDLING },
    { key: 'OFF', label: 'Off', dot: COLOR.OFF },
  ]

  return (
    <div className="space-y-3">
      {located.length > 0 ? (
        <MapView points={located.map((r) => [r.s.lastLocation!.latitude, r.s.lastLocation!.longitude])} height={380}>
          {located.map(({ s, minutes, stale }) => {
            const name = displayName(s.member.fullName, s.member.nickname)
            return (
              <Marker
                key={s.member.id}
                position={[s.lastLocation!.latitude, s.lastLocation!.longitude]}
                zIndexOffset={s.member.id === selectedId ? 1000 : 0}
                icon={personIcon({
                  initials: initials(s.member.fullName),
                  color: COLOR[s.status],
                  age: ageLabel(minutes ?? 0),
                  stale,
                  selected: s.member.id === selectedId,
                  dim: s.status === 'OFF',
                })}
                eventHandlers={{ click: () => setSelectedId(s.member.id) }}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1 text-sm">
                    <p className="font-bold">{name}</p>
                    <p className="text-neutral-600">
                      {FLEET_STATUS_LABELS[s.status]} · {place(s)}
                    </p>
                    <p className="text-xs text-neutral-500">Updated {ageLabel(minutes ?? 0)} ago</p>
                    <button onClick={() => onShowRoute(s.member.id)} className="mt-1.5 w-full rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white">
                      Today’s route
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapView>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-xl2 bg-neutral-100 text-sm text-neutral-500">No locations to show yet today</div>
      )}

      <div className="flex items-baseline justify-between px-0.5">
        <h3 className="text-[17px] font-extrabold text-neutral-900">Last known locations</h3>
        <span className="text-xs text-neutral-500">From clock & visit points</span>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {filters.map((f) => {
          const active = filter === f.key
          const count = f.key === 'all' ? rows.length : rows.filter((r) => r.s.status === f.key).length
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-xs font-bold ${
                active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.dot }} />
              {f.label} {count}
            </button>
          )
        })}
      </div>

      <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
        {shown.map(({ s, minutes, stale }) => (
          <button
            key={s.member.id}
            onClick={() => setSelectedId(s.member.id)}
            className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${s.member.id === selectedId ? 'bg-brand-50' : ''}`}
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-extrabold text-brand-700">
              {initials(s.member.fullName)}
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-white dark:border-neutral-900" style={{ backgroundColor: COLOR[s.status] }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-neutral-900">{displayName(s.member.fullName, s.member.nickname)}</span>
              <span className="block truncate text-xs text-neutral-600">
                {FLEET_STATUS_LABELS[s.status]} · {place(s)}
              </span>
            </span>
            <span className={`shrink-0 text-xs font-bold ${stale ? 'text-status-warn' : 'text-neutral-500'}`}>{minutes === null ? '—' : `${ageLabel(minutes)}${minutes >= 1 ? ' ago' : ''}`}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-neutral-500">Nobody in this filter.</p>}
      </div>
    </div>
  )
}
