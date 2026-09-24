import { useMemo, useState } from 'react'
import { Circle, Marker, Polyline } from 'react-leaflet'
import { MapView } from '@/features/maps/MapView'
import { DayPickerBar } from '@/features/attendance/DayPickerBar'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { displayName } from '@/lib/displayName'
import { formatDuration, formatTime } from '@/lib/datetime'
import { formatDistance } from '@/lib/geo'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { useTeamDayJourneys } from '../useTeamDayJourneys'
import type { FleetMemberSnapshot } from '../types'
import { buildTeamRoute, type RouteEvent } from './teamRoute'
import { stopIcon } from './mapIcons'

const KIND = {
  'clock-in': { color: '#0f6e4f', square: true, label: 'IN' },
  'clock-out': { color: '#6b7484', square: true, label: 'OUT' },
  visit: { color: '#6552c9', square: false, label: '' },
  idle: { color: '#b8590f', square: true, label: 'II' },
} as const

const DAY_START = 7 * 60
const DAY_END = 18 * 60

function minuteOfDay(iso: string): number {
  const [h, m] = formatTime(iso).split(':').map(Number)
  return h * 60 + m
}

/** One person's day on the map: the path between their stops, numbered visits, idle stretches, and a tappable timeline. */
export function RoutesMap({ snapshots, userId, onUserChange }: { snapshots: FleetMemberSnapshot[]; userId: string | null; onUserChange: (id: string) => void }) {
  const [date, setDate] = useState(() => todayDateString())
  const [selected, setSelected] = useState<number | null>(null)
  const range = useMemo(() => getCustomRange(date, date), [date])
  const ids = useMemo(() => snapshots.map((s) => s.member.id), [snapshots])
  const { journeysByUserId, loading } = useTeamDayJourneys(ids, range, date)

  // People with something to draw that day first, then everyone else.
  const people = useMemo(
    () => [...snapshots].sort((a, b) => Number(!!journeysByUserId[b.member.id]) - Number(!!journeysByUserId[a.member.id])),
    [snapshots, journeysByUserId]
  )
  const who = userId && ids.includes(userId) ? userId : people[0]?.member.id ?? null
  const route = useMemo(() => buildTeamRoute(who ? journeysByUserId[who] ?? null : null), [who, journeysByUserId])
  const names = useCustomerNames(route.events.map((e) => e.customerId ?? null))
  const current = selected !== null && selected < route.events.length ? selected : route.events.length - 1
  const isToday = date === todayDateString()

  function title(e: RouteEvent): string {
    if (e.kind === 'clock-in') return 'Clock in'
    if (e.kind === 'clock-out') return 'Clock out'
    if (e.kind === 'idle') return `Idle ${formatDuration(e.minutes * 60_000)}`
    return e.customerId ? names[e.customerId] ?? 'Customer' : 'Unassigned visit'
  }
  function detail(e: RouteEvent): string {
    if (e.kind === 'visit') return `${e.ongoing ? 'In visit · ' : ''}${formatDuration(e.minutes * 60_000)}${e.flagged ? ' · flagged' : ''}`
    if (e.kind === 'idle') return e.ongoing ? 'No visit since — still going' : 'Barely moved between visits'
    return formatTime(e.start)
  }
  function time(e: RouteEvent): string {
    if (e.kind === 'clock-in' || e.kind === 'clock-out') return formatTime(e.start)
    return `${formatTime(e.start)}–${e.end ? formatTime(e.end) : 'now'}`
  }

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {people.map((s) => {
          const active = s.member.id === who
          const n = s.member.fullName
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
          return (
            <button
              key={s.member.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelected(null)
                onUserChange(s.member.id)
              }}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full border-[1.5px] pl-1 pr-3.5 text-[13px] font-bold ${
                active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-600'
              } ${journeysByUserId[s.member.id] ? '' : 'opacity-60'}`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11.5px] font-extrabold ${active ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{n}</span>
              {displayName(s.member.fullName, s.member.nickname).split(' ')[0]}
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-card">
        <DayPickerBar
          selected={date}
          onChange={(d) => {
            setSelected(null)
            setDate(d)
          }}
        />
      </div>

      {route.path.length > 0 ? (
        <MapView points={route.path} height={340}>
          <Polyline positions={route.path} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.9 }} />
          <Polyline positions={route.path} pathOptions={{ color: '#1668b8', weight: 4 }} />
          {route.events.map((e, i) =>
            e.kind === 'idle' ? (
              <Circle key={i} center={[e.lat, e.lng]} radius={120} pathOptions={{ color: '#b8590f', weight: 2, dashArray: '4 4', fillOpacity: 0.15 }} eventHandlers={{ click: () => setSelected(i) }} />
            ) : (
              <Marker
                key={i}
                position={[e.lat, e.lng]}
                zIndexOffset={i === current ? 1000 : 0}
                icon={stopIcon({
                  label: e.kind === 'visit' ? String(e.n) : KIND[e.kind].label,
                  color: e.kind === 'visit' && e.flagged ? '#b8590f' : KIND[e.kind].color,
                  square: KIND[e.kind].square,
                  selected: i === current,
                })}
                eventHandlers={{ click: () => setSelected(i) }}
              />
            )
          )}
        </MapView>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-xl2 bg-neutral-100 text-sm text-neutral-500">
          {loading ? 'Loading route…' : 'No clock-ins or visits on this day'}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Visits" value={String(route.stats.visits)} />
        <Stat label="Distance" value={formatDistance(route.stats.distanceMeters)} />
        <Stat label="Visiting" value={formatDuration(route.stats.visitingMs)} />
        <Stat label="Idle" value={formatDuration(route.stats.idleMs)} warn={route.stats.idleMs > 0} />
      </div>

      {route.events.length > 0 && (
        <div className="rounded-2xl bg-white px-4 py-3 shadow-card">
          <div className="relative h-7">
            <span className="absolute inset-x-0 top-3 h-1 rounded-full bg-neutral-100" />
            {isToday && (
              <span
                className="absolute left-0 top-3 h-1 rounded-full bg-brand-500"
                style={{ width: `${Math.min(100, Math.max(0, ((minuteOfDay(new Date().toISOString()) - DAY_START) / (DAY_END - DAY_START)) * 100))}%` }}
              />
            )}
            {route.events.map((e, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${title(e)} at ${formatTime(e.start)}`}
                onClick={() => setSelected(i)}
                className="absolute top-1 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white dark:border-neutral-900"
                style={{
                  left: `${Math.min(100, Math.max(0, ((minuteOfDay(e.start) - DAY_START) / (DAY_END - DAY_START)) * 100))}%`,
                  backgroundColor: e.kind === 'visit' && e.flagged ? '#b8590f' : KIND[e.kind].color,
                  boxShadow: i === current ? '0 0 0 3px #1668b8' : '0 1px 3px rgba(0,0,0,.25)',
                }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
            <span>07:00</span>
            <span>12:00</span>
            <span>18:00</span>
          </div>
        </div>
      )}

      <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-card dark:divide-neutral-800">
        {route.events.map((e, i) => (
          <button key={i} onClick={() => setSelected(i)} className={`flex w-full items-start gap-3 px-3.5 py-3 text-left ${i === current ? 'bg-brand-50' : ''}`}>
            <span
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center text-[11px] font-extrabold text-white"
              style={{ backgroundColor: e.kind === 'visit' && e.flagged ? '#b8590f' : KIND[e.kind].color, borderRadius: KIND[e.kind].square ? 8 : 9999 }}
            >
              {e.kind === 'visit' ? e.n : KIND[e.kind].label}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900">{title(e)}</span>
                <span className="shrink-0 font-mono text-[11.5px] font-semibold text-neutral-500">{time(e)}</span>
              </span>
              <span className="block text-xs text-neutral-600">{detail(e)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2.5 shadow-card">
      <p className="text-[11px] font-semibold text-neutral-500">{label}</p>
      <p className={`truncate text-[14px] font-extrabold ${warn ? 'text-status-warn' : 'text-neutral-900'}`}>{value}</p>
    </div>
  )
}
