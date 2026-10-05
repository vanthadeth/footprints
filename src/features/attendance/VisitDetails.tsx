import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Phone } from 'lucide-react'
import { Marker } from 'react-leaflet'
import { useLanguage } from '@/i18n/LanguageContext'
import { MapView } from '@/features/maps/MapView'
import { pinIcon } from '@/features/maps/markers'
import { useCustomerInsights } from '@/features/visits/customerInsights'
import { VisitPhotoStrip } from '@/features/visits/VisitPhotoStrip'
import { formatUsd } from '@/features/visits/visitOutcome'
import type { VisitOption } from '@/features/visits/visitOptionsService'
import { customerBookService, type ActivityRow } from '@/features/customers/customerBookService'
import { formatDate, formatDuration, formatTime } from '@/lib/datetime'
import { formatDistance } from '@/lib/geo'
import type { VisitRow } from './types'

const SECTION = 'mb-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500'
const CARD = 'rounded-2xl border border-neutral-100 bg-white shadow-card'

/**
 * Read-only view of one visit, laid out like the canvas's "Polish · Visit
 * details": who it was with and what came of it up top, where and when,
 * the full record, photos and remarks, the customer's previous visits, and
 * a way to call or open the customer. The edit form and void/restore stay
 * with the caller, which owns that state.
 */
export function VisitDetails({
  visit,
  number,
  label,
  optionsById,
  editableUntil,
}: {
  visit: VisitRow
  number: number
  label: string
  optionsById: Record<string, VisitOption>
  /** End of the edit window when the record can still be changed, for the note at the bottom. */
  editableUntil: Date | null
}) {
  const { t, tValue, language } = useLanguage()
  const navigate = useNavigate()
  const { customer } = useCustomerInsights(visit.customer_id)
  const [history, setHistory] = useState<ActivityRow[]>([])

  useEffect(() => {
    if (!visit.customer_id) return
    let cancelled = false
    customerBookService
      .activity(visit.customer_id)
      .then((rows) => !cancelled && setHistory(rows.filter((r) => r.visit_id !== visit.id && !r.cancelled_at && r.checked_in_at < visit.checked_in_at).slice(0, 3)))
      .catch(() => {
        // Earlier visits are context only -- a failed load just hides the list.
      })
    return () => {
      cancelled = true
    }
  }, [visit.customer_id, visit.id, visit.checked_in_at])

  const option = (id: string | null) => (id ? optionsById[id] : undefined)
  const optionLabel = (o: VisitOption | undefined) => (o ? tValue(`visitOption:${o.id}`, o.label) : null)
  const visitType = option(visit.visit_type_id)
  const visitStatus = option(visit.visit_status_id)
  const orderStatus = option(visit.order_status_id)
  const paymentStatus = option(visit.payment_status_id)
  const order = visit.order_amount_usd
  const paid = visit.collected_usd
  const owed = order != null && paid != null && order - paid > 0 ? order - paid : null
  const closed = !!visit.checked_out_at
  const stayMs = closed ? new Date(visit.checked_out_at!).getTime() - new Date(visit.checked_in_at).getTime() : null

  const chips: { label: string; tone: 'ok' | 'danger' | 'plain' }[] = []
  if (orderStatus) chips.push({ label: optionLabel(orderStatus)!, tone: /^ordered$/i.test(orderStatus.label.trim()) ? 'ok' : 'plain' })
  if (paymentStatus) chips.push({ label: optionLabel(paymentStatus)!, tone: /full|part/i.test(paymentStatus.label) ? 'ok' : 'plain' })
  if (owed != null) chips.push({ label: t('visitDetails.stillOwed', { amount: formatUsd(owed) }), tone: 'danger' })
  if (chips.length === 0 && visitStatus) chips.push({ label: optionLabel(visitStatus)!, tone: 'plain' })

  const stats = [
    { label: t('visitDetails.timeHere'), value: stayMs != null ? formatDuration(stayMs, language) : t('journey.inProgress'), note: `${formatTime(visit.checked_in_at)} – ${closed ? formatTime(visit.checked_out_at) : t('journey.now')}` },
    { label: t('visitDetails.order'), value: order != null ? formatUsd(order) : '—', note: optionLabel(orderStatus) ?? '' },
    { label: t('visitDetails.paidNow'), value: paid != null ? formatUsd(paid) : '—', note: owed != null ? t('visitDetails.owed', { amount: formatUsd(owed) }) : '', ok: paid != null && paid > 0 },
  ]

  const zone = (distance: number | null, outside: boolean | null) =>
    distance == null
      ? t('visitDetails.noLocation')
      : `${outside ? t('visitDetails.outsideZone') : t('visitDetails.insideZone')} · ${t('visitDetails.fromPin', { distance: formatDistance(distance) })}`

  const points: [number, number][] = []
  const inPoint = visit.in_latitude != null && visit.in_longitude != null ? ([visit.in_latitude, visit.in_longitude] as [number, number]) : null
  const outPoint = visit.out_latitude != null && visit.out_longitude != null ? ([visit.out_latitude, visit.out_longitude] as [number, number]) : null
  const shopPoint = customer?.latitude != null && customer?.longitude != null ? ([customer.latitude, customer.longitude] as [number, number]) : null
  for (const p of [shopPoint, inPoint, outPoint]) if (p) points.push(p)

  const record: { label: string; value: string; note?: string; ok?: boolean }[] = []
  if (visitType) record.push({ label: t('visitDetails.typeOfVisit'), value: optionLabel(visitType)! })
  if (visitStatus) record.push({ label: t('journey.visitStatusRecord'), value: optionLabel(visitStatus)! })
  if (orderStatus || order != null)
    record.push({ label: t('journey.orderStatusRecord'), value: optionLabel(orderStatus) ?? '—', note: order != null ? formatUsd(order) : undefined, ok: /^ordered$/i.test(orderStatus?.label.trim() ?? '') })
  if (paymentStatus || paid != null)
    record.push({
      label: t('journey.paymentStatusRecord'),
      value: optionLabel(paymentStatus) ?? '—',
      note: [paid != null ? t('visitDetails.paidAmount', { amount: formatUsd(paid) }) : null, owed != null ? t('visitDetails.owed', { amount: formatUsd(owed) }) : null].filter(Boolean).join(' · ') || undefined,
      ok: paid != null && paid > 0,
    })
  if (visit.next_appointment) record.push({ label: t('journey.nextVisitRecord'), value: formatDate(visit.next_appointment) })

  const meta = [customer?.business_type, customer?.district_name ?? customer?.province_name, customer?.owner_name ? t('visitDetails.ownerLine', { name: customer.owner_name }) : null].filter(Boolean).join(' · ')
  const phone = customer?.primary_contact_phone
  const editNote = editableUntil
    ? t(editableUntil.toDateString() === new Date().toDateString() ? 'visitDetails.editUntilToday' : 'visitDetails.editUntilTomorrow', { time: formatTime(editableUntil.toISOString()) })
    : null

  return (
    <div className="flex flex-col gap-3.5">
      <section aria-label={t('visitDetails.customer')} className={`${CARD} p-3.5`}>
        <div className="flex items-center gap-3">
          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-brand-500 text-lg font-extrabold text-white">{number}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-extrabold text-neutral-900">{label}</span>
            {meta && <span className="mt-px block truncate text-[13px] text-neutral-500">{meta}</span>}
          </span>
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className={`inline-flex h-[26px] items-center gap-1 rounded-full pl-[7px] pr-2.5 text-xs font-bold ${
                  c.tone === 'ok' ? 'bg-status-working/10 text-status-working' : c.tone === 'danger' ? 'bg-status-danger/10 text-status-danger' : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {c.tone !== 'danger' && <Check className="h-[13px] w-[13px]" strokeWidth={2.6} aria-hidden />}
                {c.label}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 border-t border-neutral-100 pt-3">
          {stats.map((m, i) => (
            <div key={m.label} className={`min-w-0 px-2 ${i ? 'border-l border-neutral-100' : 'pl-0'}`}>
              <p className="text-[11px] text-neutral-500">{m.label}</p>
              <p className={`mt-0.5 truncate text-base font-extrabold ${m.ok ? 'text-status-working' : 'text-neutral-900'}`}>{m.value}</p>
              {m.note && <p className="mt-px truncate text-[11px] text-neutral-500">{m.note}</p>}
            </div>
          ))}
        </div>
      </section>

      <section aria-label={t('visitDetails.whereWhen')} className={`${CARD} overflow-hidden`}>
        {points.length > 0 && (
          <MapView points={points} height={120} rounded={false}>
            {shopPoint && <Marker position={shopPoint} icon={pinIcon('#006ACC', { size: 26, label: String(number) })} />}
            {inPoint && <Marker position={inPoint} icon={pinIcon('#00701F', { size: 18 })} />}
            {outPoint && <Marker position={outPoint} icon={pinIcon('#6552c9', { size: 18 })} />}
          </MapView>
        )}
        <div className="px-3.5 pb-2.5 pt-1">
          <TimeRow dot="bg-status-working" label={t('visitDetails.checkedIn')} sub={zone(visit.distance_m, visit.out_of_range)} value={formatTime(visit.checked_in_at)} warn={visit.out_of_range} first />
          <TimeRow
            dot="bg-status-visiting"
            label={t('visitDetails.checkedOut')}
            sub={closed ? (visit.auto_closed ? t('journey.auto') : zone(visit.checkout_distance_m, visit.checkout_out_of_range)) : t('journey.inProgress')}
            value={closed ? formatTime(visit.checked_out_at) : '—'}
            warn={!!visit.checkout_out_of_range}
          />
        </div>
      </section>

      {record.length > 0 && (
        <section aria-label={t('visitDetails.visitRecord')} className={`${CARD} px-3.5 pb-1 pt-3.5`}>
          <p className={SECTION}>{t('visitDetails.visitRecord')}</p>
          {record.map((r) => (
            <div key={r.label} className="flex min-h-10 items-baseline justify-between gap-3 border-t border-neutral-100 py-2.5">
              <span className="text-[13px] text-neutral-500">{r.label}</span>
              <span className="text-right">
                <span className={`block text-sm font-bold ${r.ok ? 'text-status-working' : 'text-neutral-900'}`}>{r.value}</span>
                {r.note && <span className="block text-[11px] text-neutral-500">{r.note}</span>}
              </span>
            </div>
          ))}
        </section>
      )}

      <PhotosAndRemarks visitId={visit.id} remarks={visit.remarks} />

      {visit.customer_id && (
        <section aria-label={t('visitDetails.thisCustomer')} className={`${CARD} px-3.5 py-1`}>
          <p className={`${SECTION} pt-2.5`}>{t('visitDetails.thisCustomer')}</p>
          {history.length === 0 && <p className="border-t border-neutral-100 py-3 text-[13px] text-neutral-500">{t('visitDetails.noEarlierVisits')}</p>}
          {history.map((v) => (
            <div key={v.visit_id} className="flex min-h-11 items-center gap-2.5 border-t border-neutral-100">
              <span className="w-14 shrink-0 text-xs font-bold text-neutral-500">{formatDate(v.checked_in_at)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">{[v.visit_status, v.order_status, v.payment_status].filter(Boolean).join(' · ') || '—'}</span>
              <span className="shrink-0 text-[13px] font-bold text-neutral-900">{v.order_amount != null ? formatUsd(v.order_amount) : '—'}</span>
            </div>
          ))}
        </section>
      )}

      {visit.customer_id && (
        <div className={`grid gap-2 ${phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {phone && (
            <a href={`tel:${phone}`} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
              <Phone className="h-[17px] w-[17px]" aria-hidden />
              {t('visitDetails.call')}
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate(`/customers/${visit.customer_id}`)}
            className="flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] bg-brand-500 text-sm font-bold text-white"
          >
            {t('visitDetails.openCustomer')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {editNote && <p className="-mt-1 text-center text-xs text-neutral-500">{editNote}</p>}
    </div>
  )
}

function TimeRow({ dot, label, sub, value, warn = false, first = false }: { dot: string; label: string; sub: string; value: string; warn?: boolean; first?: boolean }) {
  return (
    <div className={`flex min-h-11 items-center gap-2.5 py-1.5 ${first ? '' : 'border-t border-neutral-100'}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-neutral-900">{label}</span>
        <span className={`block text-xs ${warn ? 'text-status-warn' : 'text-neutral-500'}`}>{sub}</span>
      </span>
      <span className="shrink-0 text-sm font-extrabold tabular-nums text-neutral-900">{value}</span>
    </div>
  )
}

function PhotosAndRemarks({ visitId, remarks }: { visitId: string; remarks: string | null }): ReactNode {
  const { t } = useLanguage()
  return (
    <section aria-label={t('visitDetails.photosRemarks')} className={`${CARD} flex flex-col gap-3 p-3.5 empty:hidden`}>
      <VisitPhotoStrip visitId={visitId} editable={false} />
      {remarks && (
        <div>
          <p className={SECTION}>{t('visitDetails.remarks')}</p>
          <p className="whitespace-pre-wrap rounded-xl bg-neutral-50 px-3 py-2.5 text-sm leading-5 text-neutral-700">{remarks}</p>
        </div>
      )}
    </section>
  )
}
