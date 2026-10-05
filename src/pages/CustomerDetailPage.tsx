import { useEffect, useState } from 'react'
import { useTab } from '@/hooks/useTab'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Construction, MapPin, Navigation, NotebookPen, Phone, Store } from 'lucide-react'
import { customersService, type CustomerDirectoryRow } from '@/features/customers/customersService'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { TierCard } from '@/features/customers/TierCard'
import { CustomerVisitActivity } from '@/features/customers/CustomerVisitActivity'
import { CustomerCalendar } from '@/features/customers/CustomerCalendar'
import { useCustomerActivity } from '@/features/customers/useCustomerBook'
import { CUSTOMER_MANAGEMENT_ENABLED } from '@/lib/featureFlags'
import { useProfile } from '@/features/auth/useProfile'
import { ConversationSection } from '@/features/conversations/ConversationSection'
import { sheetSyncService } from '@/features/sheetSync/sheetSyncService'
import { LogCallSheet } from '@/features/conversations/LogCallSheet'
import { conversationsService } from '@/features/conversations/conversationsService'
import type { ConversationKind } from '@/features/conversations/conversationMeta'

const usd = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : 'Asia/Phnom_Penh' })

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-status-working/10 text-status-working',
  inactive: 'bg-neutral-100 text-neutral-500',
  banned: 'bg-status-danger/10 text-status-danger',
}

/** A customer's profile: how to reach them, a fast path into a visit, and their recent activity. No sales/outstanding figures yet -- see the redesign plan (Phase 2, once Orders ship). */
export function CustomerDetailPage() {
  if (!CUSTOMER_MANAGEMENT_ENABLED) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <Construction className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Customer management is temporarily unavailable.</p>
      </div>
    )
  }

  return <CustomerDetail />
}

function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<CustomerDirectoryRow | null>(null)
  const [activityKey, setActivityKey] = useState(0)
  const activity = useCustomerActivity(id, activityKey)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visitOpen, setVisitOpen] = useState(false)
  const { profile } = useProfile()
  const [canLog, setCanLog] = useState(false)
  const [logKind, setLogKind] = useState<ConversationKind | null>(null)
  const [conversationKey, setConversationKey] = useState(0)
  const [tab, setTab] = useTab(['info', 'cal', 'conv'] as const, 'info')
  // When balances last came from the Google Sheet sync ("as of" next to the balance).
  const [balanceAsOf, setBalanceAsOf] = useState<string | null>(null)

  useEffect(() => {
    sheetSyncService.balanceAsOf().then(setBalanceAsOf).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    conversationsService
      .canLog(id)
      .then((ok) => {
        if (!cancelled) setCanLog(ok)
      })
      .catch(() => {
        // Without the answer we just don't offer Log call; the server would refuse anyway.
      })
    customersService
      .get(id)
      .then((c) => {
        if (!cancelled) setCustomer(c)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load customer.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4 md:max-w-2xl">
        <div className="h-8 w-24 animate-pulse rounded bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-xl2 bg-neutral-100" />
        <div className="h-24 animate-pulse rounded-xl2 bg-neutral-100" />
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="mx-auto max-w-lg p-4 md:max-w-2xl">
        <BackLink onClick={() => navigate('/customers')} />
        <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error ?? 'Customer not found.'}</p>
      </div>
    )
  }

  const presetCustomer: PresetCustomer = { id: customer.id!, shopName: customer.shop_name ?? 'Customer' }
  const mapsQuery =
    customer.latitude != null && customer.longitude != null
      ? `${customer.latitude},${customer.longitude}`
      : (customer.street_address ?? customer.shop_name ?? '')

  const sub = [customer.business_type, customer.district_name, customer.province_name].filter(Boolean).join(' · ')
  const owes = customer.balance_usd ?? 0

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="flex flex-col gap-3.5 px-4 pt-1.5 md:px-8">
        <section aria-label={customer.shop_name ?? 'Customer'} className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-brand-500 text-white">
              <Store className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold leading-6 text-neutral-900">{customer.shop_name}</span>
              {sub && <span className="block truncate text-[13px] text-neutral-500">{sub}</span>}
            </span>
            {customer.status && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[customer.status] ?? ''}`}>{customer.status}</span>}
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <a
              href={customer.primary_contact_phone ? `tel:${customer.primary_contact_phone}` : undefined}
              aria-disabled={!customer.primary_contact_phone}
              onClick={() => {
                // Ask them to log it once they come back from the dialler.
                if (canLog) setTimeout(() => setLogKind('call'), 600)
              }}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-900 tap-target ${!customer.primary_contact_phone ? 'pointer-events-none opacity-40' : ''}`}
            >
              <Phone className="h-4 w-4" aria-hidden /> Call
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noopener"
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-900 tap-target"
            >
              <Navigation className="h-4 w-4" aria-hidden /> Navigate
            </a>
            <button onClick={() => setVisitOpen(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-white tap-target">
              <MapPin className="h-4 w-4" aria-hidden /> Visit
            </button>
          </div>
        </section>

        <div role="tablist" aria-label="Customer" className="flex gap-0.5 rounded-xl bg-neutral-100 p-[3px]">
          {(
            [
              ['info', 'Information'],
              ['cal', 'Calendar'],
              ['conv', 'Conversation'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`h-9 flex-1 rounded-[9px] text-[13px] ${tab === k ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <>
            <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
              <InfoRow label="Owes" value={customer.balance_usd != null ? usd(customer.balance_usd) : '—'} note={customer.balance_usd != null && balanceAsOf ? `as of ${shortDate(balanceAsOf)}` : undefined} tone={owes > 0 ? 'text-status-danger' : undefined} />
              {customer.credit_limit_usd != null && <InfoRow label="Credit limit" value={usd(customer.credit_limit_usd)} />}
              <InfoRow label="Last purchase" value={customer.last_purchase_date ? shortDate(customer.last_purchase_date) : '—'} />
              <InfoRow label="Last visit" value={customer.last_visit_date ? shortDate(customer.last_visit_date) : '—'} />
              <InfoRow label="Contact" value={[customer.primary_contact_name, customer.primary_contact_phone].filter(Boolean).join(' · ') || '—'} />
              <InfoRow label="Address" value={[customer.street_address, customer.commune_name, customer.district_name, customer.province_name].filter(Boolean).join(', ') || '—'} />
              {customer.owner_name && <InfoRow label="Salesperson" value={customer.owner_name} />}
            </div>
            <TierCard customerId={customer.id!} />
            {activity.error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{activity.error}</p>}
            <CustomerVisitActivity rows={activity.data} loading={activity.loading} />
          </>
        )}

        {tab === 'cal' && <CustomerCalendar rows={activity.data} />}

        {tab === 'conv' && (
          <>
            {canLog && (
              <button
                type="button"
                onClick={() => setLogKind('note')}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900"
              >
                <NotebookPen className="h-4 w-4" aria-hidden /> Add a note
              </button>
            )}
            <ConversationSection customerId={customer.id!} meId={profile?.id ?? null} refreshKey={conversationKey} onLogCall={canLog ? () => setLogKind('call') : undefined} />
          </>
        )}
      </div>

      <VisitFlow
        open={visitOpen}
        onClose={() => {
          setVisitOpen(false)
          setActivityKey((k) => k + 1)
        }}
        presetCustomer={presetCustomer}
      />
      <LogCallSheet
        open={logKind != null}
        onClose={() => setLogKind(null)}
        kind={logKind ?? 'call'}
        customerId={customer.id!}
        customerName={customer.shop_name ?? 'Customer'}
        customerOwnerId={customer.owner_id ?? null}
        meId={profile?.id ?? null}
        onSaved={() => setConversationKey((k) => k + 1)}
      />
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm font-medium text-neutral-600 tap-target">
      <ArrowLeft className="h-4 w-4" /> Customers
    </button>
  )
}

function InfoRow({ label, value, note, tone = 'text-neutral-900' }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-neutral-100 px-3.5 py-3 first:border-t-0">
      <span className="shrink-0 text-sm text-neutral-500">{label}</span>
      <span className="min-w-0 text-right">
        <span className={`block text-[15px] font-semibold ${tone}`}>{value}</span>
        {note && <span className="block text-xs text-neutral-500">{note}</span>}
      </span>
    </div>
  )
}
