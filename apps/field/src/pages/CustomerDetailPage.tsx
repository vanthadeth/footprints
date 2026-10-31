import { useEffect, useState } from 'react'
import { useTab } from '@/hooks/useTab'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Construction, Eye, MapPin, MoreHorizontal, Navigation, NotebookPen, Phone, PlusCircle, Share2, Store, UserRound } from 'lucide-react'
import { customersService, type CustomerDirectoryRow } from '@/features/customers/customersService'
import { VisitFlow, type PresetCustomer } from '@/features/visits/VisitFlow'
import { TierCard } from '@/features/customers/TierCard'
import { BottomSheet } from '@/components/BottomSheet'
import { planService } from '@/features/plan/planService'
import { useCustomerInvoices } from '@/features/customers/detail/useCustomerInvoices'
import { ageing } from '@/features/customers/detail/ageing'
import { dayDiff } from '@/features/customers/book'
import { OrdersTab } from '@/features/customers/detail/OrdersTab'
import { PaymentsTab } from '@/features/customers/detail/PaymentsTab'
import { agoText } from '@/features/customers/detail/timeline'
import { fullDate } from '@/features/customers/detail/dates'
import { todayDateString } from '@/lib/dateRange'
import { CustomerVisitActivity } from '@/features/customers/CustomerVisitActivity'
import { useCustomerActivity } from '@/features/customers/useCustomerBook'
import { CUSTOMER_MANAGEMENT_ENABLED } from '@/lib/featureFlags'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { ConversationSection } from '@/features/conversations/ConversationSection'
import { LogCallSheet } from '@/features/conversations/LogCallSheet'
import { conversationsService } from '@/features/conversations/conversationsService'
import type { ConversationKind } from '@/features/conversations/conversationMeta'

const usd = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_KEYS: Record<string, string> = { active: 'customerDetail.statusActive', inactive: 'customerDetail.statusInactive', banned: 'customerDetail.statusBanned' }
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-status-working/10 text-status-working',
  inactive: 'bg-neutral-100 text-neutral-500',
  banned: 'bg-status-danger/10 text-status-danger',
}

/** A customer's profile: how to reach them, a fast path into a visit, and their recent activity. No sales/outstanding figures yet -- see the redesign plan (Phase 2, once Orders ship). */
export function CustomerDetailPage() {
  const { t } = useLanguage()
  if (!CUSTOMER_MANAGEMENT_ENABLED) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <Construction className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">{t('customerDetail.unavailable')}</p>
      </div>
    )
  }

  return <CustomerDetail />
}

function CustomerDetail() {
  const { t, language } = useLanguage()
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
  const [tab, setTab] = useTab(['info', 'orders', 'payments', 'conv'] as const, 'info')
  const [interFilter, setInterFilter] = useState<'all' | 'visits' | 'notes'>('all')
  const today = todayDateString()
  const [moreOpen, setMoreOpen] = useState(false)
  const [inPlan, setInPlan] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const invoices = useCustomerInvoices(id)

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
        if (!cancelled) setError(e instanceof Error ? e.message : '')
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
        <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error === null ? t('customerDetail.notFound') : error || t('customerDetail.loadFailed')}</p>
      </div>
    )
  }

  const presetCustomer: PresetCustomer = { id: customer.id!, shopName: customer.shop_name ?? t('customerDetail.customer') }
  const mapsQuery =
    customer.latitude != null && customer.longitude != null
      ? `${customer.latitude},${customer.longitude}`
      : (customer.street_address ?? customer.shop_name ?? '')

  const sub = [customer.business_type, customer.district_name, customer.province_name].filter(Boolean).join(' · ')
  const lastVisit = customer.last_visit_date ?? null
  const daysSince = lastVisit ? Math.max(0, dayDiff(lastVisit.slice(0, 10), today)) : null
  const edge = daysSince == null || daysSince > 45 ? 'bg-status-danger' : daysSince > 30 ? 'bg-status-warn' : 'bg-status-working'
  const seenChip = daysSince == null ? 'bg-status-danger/10 text-status-danger' : daysSince > 45 ? 'bg-status-danger/10 text-status-danger' : daysSince > 30 ? 'bg-status-warn/10 text-status-warn' : 'bg-status-working/10 text-status-working'
  const ageing_ = ageing(invoices.rows, customer.balance_usd, today)
  const pastDue = ageing_.open.filter((o) => o.daysPastDue > 0)
  const pastDueTotal = pastDue.reduce((a, o) => a + o.open, 0)
  const owes = customer.balance_usd != null && customer.balance_usd > 0 ? customer.balance_usd : 0
  const creditPct = customer.credit_limit_usd ? Math.min(100, Math.round(((customer.balance_usd ?? 0) / customer.credit_limit_usd) * 100)) : null
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`

  const attention: { key: string; tone: string; icon: typeof AlertTriangle; title: string; sub: string; go: () => void }[] = []
  if (pastDue.length === 1) attention.push({ key: 'inv', tone: 'bg-status-danger/10 text-status-danger', icon: AlertTriangle, title: t('custPage.attInvoice', { no: pastDue[0].inv_no ?? '' }), sub: t('custPage.attInvoiceSub', { amount: usd(pastDue[0].open), n: pastDue[0].daysPastDue }), go: () => setTab('payments') })
  if (pastDue.length > 1) attention.push({ key: 'inv', tone: 'bg-status-danger/10 text-status-danger', icon: AlertTriangle, title: t('custPage.attInvoices', { n: pastDue.length }), sub: t('custPage.attInvoicesSub', { amount: usd(pastDueTotal) }), go: () => setTab('payments') })
  if (daysSince == null) attention.push({ key: 'visit', tone: 'bg-status-warn/10 text-status-warn', icon: Eye, title: t('custPage.attNever'), sub: t('custPage.attNeverSub'), go: () => setVisitOpen(true) })
  else if (daysSince > 45) attention.push({ key: 'visit', tone: 'bg-status-warn/10 text-status-warn', icon: Eye, title: t('custPage.attVisit', { n: daysSince }), sub: t('custPage.attVisitSub', { date: fullDate(lastVisit!, language) }), go: () => setVisitOpen(true) })
  if (creditPct != null && creditPct >= 80) attention.push({ key: 'credit', tone: 'bg-status-warn/10 text-status-warn', icon: AlertTriangle, title: t('custPage.attCredit'), sub: t('custPage.attCreditSub', { pct: creditPct }), go: () => setTab('payments') })

  function flash(text: string) {
    setToast(text)
    window.setTimeout(() => setToast(null), 2500)
  }
  async function addToPlan() {
    try {
      await planService.add(today, customer!.id!)
      setInPlan(true)
      flash(t('custPage.addedToPlan'))
    } catch {
      flash(t('custPage.planFailed'))
    }
  }
  async function shareLocation() {
    setMoreOpen(false)
    try {
      if (navigator.share) await navigator.share({ title: customer!.shop_name ?? '', url: mapsUrl })
      else {
        await navigator.clipboard.writeText(mapsUrl)
        flash(t('custPage.locationCopied'))
      }
    } catch {
      // Cancelled share sheet: nothing to do.
    }
  }
  const actionCls = 'flex h-14 flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-neutral-200 text-[12.5px] font-bold text-neutral-900 tap-target dark:border-neutral-700'
  const tabDefs = [
    ['info', t('custPage.tabOverview'), null],
    ['orders', t('customerDetail.tabOrders'), null],
    ['payments', t('customerDetail.tabPayments'), invoices.loading ? null : ageing_.open.length],
    ['conv', t('custPage.tabActivity'), activity.loading ? null : activity.data.length],
  ] as const

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl lg:max-w-6xl">
      <div className="flex flex-col gap-3.5 px-4 pt-1.5 md:px-8 lg:pt-6">
        <section aria-label={customer.shop_name ?? t('customerDetail.customer')} className="relative flex overflow-hidden rounded-[22px] border border-neutral-100 bg-white shadow-card lg:max-w-xl">
          <span aria-hidden className={`w-1.5 shrink-0 ${edge}`} />
          <div className="min-w-0 flex-1 space-y-3 p-3.5">
            <div className="flex items-start gap-3">
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <Store className="h-6 w-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[22px] font-bold leading-[27px] tracking-tight text-neutral-900">{customer.shop_name}</span>
                {sub && <span className="block truncate text-[13.5px] text-neutral-500">{sub}</span>}
              </span>
              <button type="button" onClick={() => setMoreOpen(true)} aria-label={t('custPage.more')} className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-600">
                <MoreHorizontal className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${seenChip}`}>{daysSince == null ? t('custPage.neverVisited') : t('custPage.seen', { ago: agoText(lastVisit, today, t) })}</span>
              {customer.status && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${STATUS_STYLES[customer.status] ?? ''}`}>{STATUS_KEYS[customer.status] ? t(STATUS_KEYS[customer.status]) : customer.status}</span>}
            </div>
            <button type="button" onClick={() => setVisitOpen(true)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold text-white tap-target">
              <MapPin className="h-5 w-5" aria-hidden /> {t('custPage.checkIn')}
            </button>
            <div className="grid grid-cols-3 gap-2">
              <a href={mapsUrl} target="_blank" rel="noopener" className={actionCls}>
                <Navigation className="h-5 w-5" aria-hidden /> {t('customerDetail.navigate')}
              </a>
              <a
                href={customer.primary_contact_phone ? `tel:${customer.primary_contact_phone}` : undefined}
                aria-disabled={!customer.primary_contact_phone}
                onClick={() => {
                  // Ask them to log it once they come back from the dialler.
                  if (canLog) setTimeout(() => setLogKind('call'), 600)
                }}
                className={`${actionCls} ${!customer.primary_contact_phone ? 'pointer-events-none opacity-40' : ''}`}
              >
                <Phone className="h-5 w-5" aria-hidden /> {t('customerDetail.call')}
              </a>
              <button type="button" onClick={addToPlan} disabled={inPlan} className={`${actionCls} disabled:opacity-60`}>
                {inPlan ? <Check className="h-5 w-5 text-status-working" aria-hidden /> : <PlusCircle className="h-5 w-5" aria-hidden />} {inPlan ? t('custPage.inPlan') : t('custPage.addPlan')}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[14px] bg-neutral-100 dark:bg-neutral-800">
              {([
                [t('customerDetail.lastVisit'), agoText(lastVisit, today, t), lastVisit ? fullDate(lastVisit, language) : t('custPage.neverVisited'), false],
                [t('custPage.lastOrder'), agoText(customer.last_purchase_date ?? null, today, t), customer.last_purchase_date ? fullDate(customer.last_purchase_date, language) : t('custPage.noOrders'), false],
                [t('custPage.owes'), usd(owes), owes === 0 ? t('custPage.nothingOpen') : pastDue.length ? t(pastDue.length === 1 ? 'custPage.pastDueOne' : 'custPage.pastDueMany', { n: pastDue.length }) : '', pastDue.length > 0],
              ] as const).map(([label, value, note, bad]) => (
                <div key={label} className="min-w-0 bg-neutral-50 px-2.5 py-2.5 dark:bg-neutral-900">
                  <p className="text-[11.5px] text-neutral-500">{label}</p>
                  <p className={`truncate text-[15px] font-bold leading-[19px] ${bad ? 'text-status-danger' : 'text-neutral-900'}`}>{value}</p>
                  <p className={`truncate text-[11px] ${bad ? 'text-status-danger' : 'text-neutral-500'}`}>{note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div role="tablist" aria-label={t('customerDetail.customer')} className="-mx-4 flex border-b border-neutral-200 px-2 md:mx-0 lg:max-w-xl dark:border-neutral-800">
          {tabDefs.map(([k, label, count]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`-mb-px flex h-12 flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-[3px] px-0.5 text-[13.5px] ${tab === k ? 'border-brand-500 font-bold text-brand-600' : 'border-transparent font-semibold text-neutral-500'}`}
            >
              {label}
              {count != null && <span className={`rounded-full px-1.5 text-[11px] font-bold ${tab === k ? 'bg-brand-50 text-brand-600' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'}`}>{count}</span>}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="flex flex-col gap-3.5 lg:max-w-xl">
            {attention.length > 0 && (
              <section aria-label={t('custPage.attention')} className="rounded-2xl border border-neutral-100 bg-white px-4 py-1 shadow-card">
                <div className="flex items-baseline justify-between pt-3 pb-1">
                  <h2 className="text-[15px] font-bold text-neutral-900">{t('custPage.attention')}</h2>
                  <span className="text-[12.5px] text-neutral-500">{attention.length}</span>
                </div>
                {attention.map((a) => (
                  <button key={a.key} type="button" onClick={a.go} className="flex min-h-[60px] w-full items-center gap-3 border-t border-neutral-100 py-2 text-left first:border-t-0 dark:border-neutral-800">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.tone}`}>
                      <a.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-neutral-900">{a.title}</span>
                      <span className="block text-[12.5px] text-neutral-500">{a.sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  </button>
                ))}
              </section>
            )}
            <TierCard customerId={customer.id!} />
            <InfoGroup title={t('customerDetail.groupContact')}>
              <div className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                  <UserRound className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-neutral-900">{customer.primary_contact_name ?? t('customerDetail.groupContact')}</span>
                  <span className="block text-[12.5px] text-neutral-500">{customer.primary_contact_phone ?? '—'}</span>
                </span>
                {customer.primary_contact_phone && (
                  <a href={`tel:${customer.primary_contact_phone}`} aria-label={t('customerDetail.call')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-neutral-200 text-brand-500 dark:border-neutral-700">
                    <Phone className="h-5 w-5" aria-hidden />
                  </a>
                )}
              </div>
              <div className="flex min-h-[60px] items-center gap-3 border-t border-neutral-100 px-3.5 py-2 dark:border-neutral-800">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                  <MapPin className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-neutral-900">{t('customerDetail.address')}</span>
                  <span className="block text-[12.5px] leading-snug text-neutral-500">{[customer.street_address, customer.commune_name, customer.district_name, customer.province_name].filter(Boolean).join(', ') || '—'}</span>
                </span>
                <a href={mapsUrl} target="_blank" rel="noopener" aria-label={t('customerDetail.navigate')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-neutral-200 text-brand-500 dark:border-neutral-700">
                  <Navigation className="h-5 w-5" aria-hidden />
                </a>
              </div>
              {customer.owner_name && <InfoRow label={t('customerDetail.salesperson')} value={customer.owner_name} />}
            </InfoGroup>
            {customer.credit_limit_usd != null && (
              <InfoGroup title={t('customerDetail.groupAccount')}>
                <div className="px-3.5 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-bold text-neutral-900">{t('customerDetail.creditLimit')}</span>
                    {customer.balance_usd != null && <span className="text-[12.5px] text-neutral-500">{t('customerDetail.creditLeft', { amount: usd(Math.max(0, customer.credit_limit_usd - customer.balance_usd)) })}</span>}
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div className={`h-full ${creditPct != null && creditPct >= 80 ? 'bg-status-warn' : 'bg-brand-500'}`} style={{ width: `${creditPct ?? 0}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[12.5px] text-neutral-500">
                    <span>{creditPct != null ? t('custPage.creditUsed', { used: usd(customer.balance_usd ?? 0), pct: creditPct }) : ''}</span>
                    <span>{usd(customer.credit_limit_usd)}</span>
                  </div>
                </div>
              </InfoGroup>
            )}
          </div>
        )}

        {tab === 'orders' && <OrdersTab customerId={customer.id!} today={today} />}

        {tab === 'payments' && <PaymentsTab customerId={customer.id!} balance={customer.balance_usd ?? null} today={today} />}

        {tab === 'conv' && (
          <div className="flex flex-col gap-3">
            {canLog && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setLogKind('note')} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
                  <NotebookPen className="h-4 w-4" aria-hidden /> {t('customerDetail.addNote')}
                </button>
                <button type="button" onClick={() => setLogKind('call')} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-900">
                  <Phone className="h-4 w-4" aria-hidden /> {t('customerDetail.logCall')}
                </button>
              </div>
            )}
            <div role="radiogroup" aria-label={t('customerDetail.filterAria')} className="flex gap-1.5">
              {(
                [
                  ['all', t('customerDetail.fAll')],
                  ['visits', t('customerDetail.fVisits')],
                  ['notes', t('customerDetail.fNotes')],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={interFilter === k}
                  onClick={() => setInterFilter(k)}
                  className={`h-8 rounded-full border px-3 text-xs font-bold ${interFilter === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {interFilter !== 'notes' && (
              <>
                {activity.error && <p className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{activity.error}</p>}
                <CustomerVisitActivity rows={activity.data} loading={activity.loading} />
              </>
            )}
            {interFilter !== 'visits' && <ConversationSection customerId={customer.id!} meId={profile?.id ?? null} refreshKey={conversationKey} onLogCall={undefined} />}
          </div>
        )}
      </div>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={customer.shop_name ?? t('customerDetail.customer')}>
        <div className="flex flex-col pb-2">
          {canLog && (
            <>
              <button type="button" onClick={() => { setMoreOpen(false); setLogKind('note') }} className="flex h-14 items-center gap-3.5 text-left text-[15.5px] font-semibold text-neutral-900">
                <NotebookPen className="h-5 w-5" aria-hidden /> {t('customerDetail.addNote')}
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); setLogKind('call') }} className="flex h-14 items-center gap-3.5 border-t border-neutral-100 text-left text-[15.5px] font-semibold text-neutral-900 dark:border-neutral-800">
                <Phone className="h-5 w-5" aria-hidden /> {t('customerDetail.logCall')}
              </button>
            </>
          )}
          <button type="button" onClick={shareLocation} className="flex h-14 items-center gap-3.5 border-t border-neutral-100 text-left text-[15.5px] font-semibold text-neutral-900 first:border-t-0 dark:border-neutral-800">
            <Share2 className="h-5 w-5" aria-hidden /> {t('custPage.shareLocation')}
          </button>
        </div>
      </BottomSheet>
      {toast && (
        <p role="status" className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
          {toast}
        </p>
      )}
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
        customerName={customer.shop_name ?? t('customerDetail.customer')}
        customerOwnerId={customer.owner_id ?? null}
        meId={profile?.id ?? null}
        onSaved={() => setConversationKey((k) => k + 1)}
      />
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage()
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm font-medium text-neutral-600 tap-target">
      <ArrowLeft className="h-4 w-4" /> {t('nav.customers')}
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

function InfoGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <p className="px-0.5 pb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">{children}</div>
    </section>
  )
}
