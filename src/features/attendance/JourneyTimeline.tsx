import { useState, type ReactNode } from 'react'
import { Camera, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { GAP_FLAG_THRESHOLD_MINUTES } from '@/lib/config'
import { formatDuration, formatTime } from '@/lib/datetime'
import { formatDistance } from '@/lib/geo'
import type { AttendanceRow, VisitRow } from './types'

interface Props {
  attendance: AttendanceRow | null
  visits: VisitRow[]
  customerNames: Record<string, string>
}

/**
 * Attendance and visit events on one chronological line, but always
 * visually distinguishable (spec §28) -- clock events use a filled brand
 * dot with a camera+pin caption, visits use an outlined dot, expandable
 * for check-in/check-out times and distance. A transit/gap entry sits
 * between every pair of consecutive events -- clock-in to the first
 * visit, visit to visit, and the last visit to clock-out -- and is
 * flagged once it runs long (GAP_FLAG_THRESHOLD_MINUTES), same as an
 * over-distance visit is flagged in its expanded detail.
 */
export function JourneyTimeline({ attendance, visits, customerNames }: Props) {
  if (!attendance) return null

  const sorted = [...visits].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const preGapMs = first ? gapBetween(attendance.clock_in_at, first.checked_in_at) : null
  const postGapMs = last?.checked_out_at && attendance.clock_out_at ? gapBetween(last.checked_out_at, attendance.clock_out_at) : null

  return (
    <ol className="relative ml-3 space-y-5 border-l-2 border-neutral-100 pl-6">
      <TimelineEntry time={attendance.clock_in_at} dotClass="bg-brand-500">
        <p className="font-semibold text-neutral-900">Clock In</p>
        <p className="flex items-center gap-1 text-xs text-neutral-400">
          <Camera className="h-3 w-3" /> Selfie + GPS
        </p>
      </TimelineEntry>

      {preGapMs != null && <GapEntry ms={preGapMs} />}

      {sorted.map((visit, i) => {
        const prev = sorted[i - 1]
        const gapMs = prev ? gapBetween(prev.checked_out_at, visit.checked_in_at) : null
        return (
          <div key={visit.id} className="contents">
            {gapMs != null && <GapEntry ms={gapMs} />}
            <VisitEntry visit={visit} index={i} customerName={visit.customer_id ? customerNames[visit.customer_id] : undefined} />
          </div>
        )
      })}

      {postGapMs != null && <GapEntry ms={postGapMs} />}

      {attendance.clock_out_at && (
        <TimelineEntry time={attendance.clock_out_at} dotClass="bg-neutral-400">
          <p className="font-semibold text-neutral-900">Clock Out</p>
          <p className="flex items-center gap-1 text-xs text-neutral-400">
            <Camera className="h-3 w-3" /> Selfie + GPS
          </p>
        </TimelineEntry>
      )}
    </ol>
  )
}

/** Gap between two ISO timestamps in ms, or null if either is missing or the gap isn't positive (nothing to show). */
function gapBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return ms > 0 ? ms : null
}

function GapEntry({ ms }: { ms: number }) {
  const flagged = ms / 60_000 > GAP_FLAG_THRESHOLD_MINUTES
  return (
    <li className={`relative -my-2 text-xs ${flagged ? 'font-medium text-status-warn' : 'italic text-neutral-400'}`}>
      <span className={`absolute -left-[1.65rem] top-1 h-2 w-2 rounded-full border-2 bg-white ${flagged ? 'border-status-warn' : 'border-neutral-200'}`} />
      Transit/Gap: {formatDuration(ms)}
      {flagged && ' · Flagged'}
    </li>
  )
}

function TimelineEntry({ time, dotClass, children }: { time: string; dotClass: string; children: ReactNode }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full ${dotClass}`} />
      <p className="text-xs font-medium text-neutral-400">{formatTime(time)}</p>
      {children}
    </li>
  )
}

function VisitEntry({
  visit,
  index,
  customerName,
}: {
  visit: VisitRow
  index: number
  customerName: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const label = visit.customer_id ? customerName ?? 'Loading…' : 'Unassigned Visit'
  const duration = visit.checked_out_at
    ? formatDuration(new Date(visit.checked_out_at).getTime() - new Date(visit.checked_in_at).getTime())
    : 'In progress'

  return (
    <li className="relative">
      <span className="absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full border-2 border-brand-400 bg-white" />
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-2 text-left tap-target">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-900">
            Visit #{visit.visit_number ?? index + 1}
            {visit.auto_closed && (
              <span className="ml-2 rounded-full bg-status-warn/10 px-2 py-0.5 text-[10px] font-medium text-status-warn">AUTO</span>
            )}
          </p>
          <p className="flex items-center gap-1 text-xs text-neutral-500">
            <MapPin className="h-3 w-3" /> {label}
          </p>
          <p className="text-xs text-neutral-400">{duration}</p>
        </div>
        {open ? (
          <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />
        ) : (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />
        )}
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800">
          <div>
            <p className="text-neutral-400">Check In</p>
            <p className="font-medium text-neutral-800">{formatTime(visit.checked_in_at)}</p>
          </div>
          <div>
            <p className="text-neutral-400">Check Out</p>
            <p className="font-medium text-neutral-800">{visit.checked_out_at ? formatTime(visit.checked_out_at) : '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-neutral-400">Distance</p>
            <p className={`font-medium ${visit.out_of_range ? 'text-status-warn' : 'text-neutral-800'}`}>
              {formatDistance(visit.distance_m)}
              {visit.out_of_range && ' · Flagged'}
            </p>
          </div>
        </div>
      )}
    </li>
  )
}
