import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Banknote, Camera, Construction, MapPin, Navigation, NotebookPen, Phone, ShoppingCart, UserRound, type LucideIcon } from 'lucide-react'
import { customersService, type CustomerDirectoryRow } from '@/features/customers/customersService'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { TierCard } from '@/features/customers/TierCard'
import { CustomerVisitActivity } from '@/features/customers/CustomerVisitActivity'
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

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <BackLink onClick={() => navigate('/customers')} />

        <div className="mt-3 rounded-xl2 bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-semibold uppercase tracking-wide text-neutral-900">{customer.shop_name}</p>
            {customer.status && (
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[customer.status] ?? ''}`}>
                {customer.status}
              </span>
            )}
          </div>
          {customer.province_name && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {[customer.street_address, customer.province_name].filter(Boolean).join(', ')}
            </p>
          )}
          {customer.primary_contact_phone && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500">
              <Phone className="h-3.5 w-3.5 shrink-0" /> {customer.primary_contact_phone}
            </p>
          )}
          {customer.owner_name && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500">
              <UserRound className="h-3.5 w-3.5 shrink-0" /> Salesperson: {customer.owner_name}
            </p>
          )}
          {(customer.balance_usd != null || customer.last_purchase_date) && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Balance</p>
                <p className={`text-[17px] font-extrabold tabular-nums ${customer.balance_usd != null && customer.balance_usd > 0 ? 'text-status-danger' : 'text-neutral-900'}`}>
                  {customer.balance_usd != null ? usd(customer.balance_usd) : '—'}
                </p>
                {customer.balance_usd != null && balanceAsOf && <p className="text-[11px] text-neutral-500">as of {shortDate(balanceAsOf)}</p>}
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Last purchase</p>
                <p className="text-[17px] font-extrabold text-neutral-900">{customer.last_purchase_date ? shortDate(customer.last_purchase_date) : '—'}</p>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <a
              href={customer.primary_contact_phone ? `tel:${customer.primary_contact_phone}` : undefined}
              aria-disabled={!customer.primary_contact_phone}
              onClick={() => {
                // Ask them to log it once they come back from the dialler.
                if (canLog) setTimeout(() => setLogKind('call'), 600)
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border border-neutral-200 py-2.5 text-xs font-semibold text-neutral-700 tap-target ${
                !customer.primary_contact_phone ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <Phone className="h-4 w-4" /> CALL
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 rounded-xl border border-neutral-200 py-2.5 text-xs font-semibold text-neutral-700 tap-target"
            >
              <Navigation className="h-4 w-4" /> NAVIGATE
            </a>
            <button
              onClick={() => setVisitOpen(true)}
              className="flex flex-col items-center gap-1 rounded-xl bg-brand-500 py-2.5 text-xs font-semibold text-white tap-target"
            >
              <MapPin className="h-4 w-4" /> VISIT
            </button>
          </div>
        </div>

        {activity.error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{activity.error}</p>}
        <CustomerVisitActivity rows={activity.data} loading={activity.loading} />

        <TierCard customerId={customer.id!} />

        <div className="mt-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            <QuickTile icon={ShoppingCart} label="New Order" comingSoon />
            <QuickTile icon={Banknote} label="Collection" comingSoon />
            <QuickTile icon={Camera} label="Photo" comingSoon />
            <QuickTile icon={NotebookPen} label="Note" comingSoon={!canLog} onClick={() => setLogKind('note')} />
          </div>
        </div>

        <ConversationSection
          customerId={customer.id!}
          meId={profile?.id ?? null}
          refreshKey={conversationKey}
          onLogCall={canLog ? () => setLogKind('call') : undefined}
        />
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

function QuickTile({ icon: Icon, label, comingSoon, onClick }: { icon: LucideIcon; label: string; comingSoon?: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={comingSoon}
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl2 border border-neutral-200 bg-white p-4 text-center tap-target disabled:opacity-40 dark:border-neutral-700"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-neutral-800 dark:text-brand-300">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      {comingSoon && <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Coming soon</span>}
    </button>
  )
}
