import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Banknote, Camera, Construction, MapPin, Navigation, NotebookPen, Phone, ShoppingCart, Store, type LucideIcon } from 'lucide-react'
import { customersService, type CustomerDirectoryRow } from '@/features/customers/customersService'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import type { VisitRow } from '@/features/attendance/types'
import { CUSTOMER_MANAGEMENT_ENABLED } from '@/lib/featureFlags'
import { formatDate, formatTime } from '@/lib/datetime'

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
  const [recentVisits, setRecentVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visitOpen, setVisitOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([customersService.get(id), customersService.recentVisits(id)])
      .then(([c, visits]) => {
        if (cancelled) return
        setCustomer(c)
        setRecentVisits(visits)
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

          <div className="mt-4 grid grid-cols-3 gap-2">
            <a
              href={customer.primary_contact_phone ? `tel:${customer.primary_contact_phone}` : undefined}
              aria-disabled={!customer.primary_contact_phone}
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

        <div className="mt-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            <QuickTile icon={ShoppingCart} label="New Order" comingSoon />
            <QuickTile icon={Banknote} label="Collection" comingSoon />
            <QuickTile icon={Camera} label="Photo" comingSoon />
            <QuickTile icon={NotebookPen} label="Note" comingSoon />
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Recent Activity</p>
          {recentVisits.length === 0 ? (
            <p className="rounded-xl2 bg-white p-4 text-sm text-neutral-500 shadow-card">No visits recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentVisits.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl2 bg-white p-3.5 shadow-card">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <Store className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900">
                      {formatDate(v.checked_in_at)} · Visit{v.cancelled_at ? ' (Voided)' : !v.checked_out_at ? ' (In progress)' : ''}
                    </p>
                    <p className="text-xs text-neutral-400">{formatTime(v.checked_in_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <VisitFlow open={visitOpen} onClose={() => setVisitOpen(false)} presetCustomer={presetCustomer} />
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

function QuickTile({ icon: Icon, label, comingSoon }: { icon: LucideIcon; label: string; comingSoon?: boolean }) {
  return (
    <button
      disabled={comingSoon}
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
