import { Camera, MapPin } from 'lucide-react'
import { formatDuration, formatTime } from '@/lib/datetime'
import type { AttendanceRow, VisitRow } from './types'

interface Props {
  attendance: AttendanceRow | null
  visits: VisitRow[]
  customerNames: Record<string, string>
}

/**
 * Attendance and visit events on one chronological line, but always
 * visually distinguishable (spec §28) -- clock events use a filled brand
 * dot with a camera+pin caption, visits use an outlined dot with duration.
 * Gaps are computed only between consecutive visits, never counted as
 * visit time (spec §30).
 */
export function JourneyTimeline({ attendance, visits, customerNames }: Props) {
  if (!attendance) return null

  const sorted = [...visits].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))

  return (
    <ol className="relative ml-3 space-y-5 border-l-2 border-neutral-100 pl-6">
      <TimelineEntry time={attendance.clock_in_at} dotClass="bg-brand-500">
        <p className="font-semibold text-neutral-900">Clock In</p>
        <p className="flex items-center gap-1 text-xs text-neutral-400">
          <Camera className="h-3 w-3" /> Selfie + GPS
        </p>
      </TimelineEntry>

      {sorted.map((visit, i) => {
        const prev = sorted[i - 1]
        const gapMs = prev?.checked_out_at ? new Date(visit.checked_in_at).getTime() - new Date(prev.checked_out_at).getTime() : null
        const label = visit.customer_id ? customerNames[visit.customer_id] ?? 'Loading…' : 'Unassigned Visit'
        const duration = visit.checked_out_at
          ? formatDuration(new Date(visit.checked_out_at).getTime() - new Date(visit.checked_in_at).getTime())
          : 'In progress'

        return (
          <div key={visit.id} className="contents">
            {gapMs != null && gapMs > 0 && (
              <li className="relative -my-2 text-xs italic text-neutral-400">
                <span className="absolute -left-[1.65rem] top-1 h-2 w-2 rounded-full border-2 border-neutral-200 bg-white" />
                Gap: {formatDuration(gapMs)}
              </li>
            )}
            <TimelineEntry time={visit.checked_in_at} dotClass="border-2 border-brand-400 bg-white">
              <p className="font-semibold text-neutral-900">
                Visit #{visit.visit_number ?? i + 1}
                {visit.auto_closed && <span className="ml-2 rounded-full bg-status-warn/10 px-2 py-0.5 text-[10px] font-medium text-status-warn">AUTO</span>}
              </p>
              <p className="flex items-center gap-1 text-xs text-neutral-500">
                <MapPin className="h-3 w-3" /> {label}
              </p>
              <p className="text-xs text-neutral-400">{duration}</p>
            </TimelineEntry>
          </div>
        )
      })}

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

function TimelineEntry({
  time,
  dotClass,
  children,
}: {
  time: string
  dotClass: string
  children: React.ReactNode
}) {
  return (
    <li className="relative">
      <span className={`absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full ${dotClass}`} />
      <p className="text-xs font-medium text-neutral-400">{formatTime(time)}</p>
      {children}
    </li>
  )
}
