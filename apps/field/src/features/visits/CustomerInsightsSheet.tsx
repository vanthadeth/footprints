import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Lightbulb, Phone, Store, Wallet, X } from 'lucide-react'
import type { CustomerDirectoryRow } from '@/features/customers/customersService'
import type { PostRow } from '@/features/conversations/conversationsService'
import { formatDate } from '@/lib/datetime'
import { daysSince, money, type CustomerInsights } from './customerInsights'

type Tip = { tone: 'money' | 'warn' | 'tip' | 'ok'; text: string }
const TIP_STYLE: Record<Tip['tone'], { cls: string; icon: typeof Check }> = {
  money: { cls: 'bg-status-danger/10 text-status-danger', icon: Wallet },
  warn: { cls: 'bg-status-warn/10 text-status-warn', icon: AlertTriangle },
  tip: { cls: 'bg-brand-50 text-brand-500', icon: Lightbulb },
  ok: { cls: 'bg-status-working/10 text-status-working', icon: Check },
}

function tipsFor(customer: CustomerDirectoryRow | null, posts: PostRow[]): Tip[] {
  const tips: Tip[] = []
  const owes = customer?.balance_usd ?? 0
  if (owes > 0) {
    const over = customer?.credit_limit_usd != null && owes > customer.credit_limit_usd
    tips.push({ tone: 'money', text: `Ask for the ${money(owes)} before taking a new order${over ? ' — it is over the credit limit.' : '.'}` })
  }
  const open = posts.filter((p) => p.follow_up_at && !p.follow_up_done_at)
  for (const p of open.slice(0, 2)) tips.push({ tone: 'warn', text: `Follow-up due ${formatDate(p.follow_up_at)}: ${p.body.slice(0, 90)}${p.body.length > 90 ? '…' : ''}` })
  if (customer?.last_purchase_date && daysSince(customer.last_purchase_date) > 45) tips.push({ tone: 'tip', text: `No purchase for ${daysSince(customer.last_purchase_date)} days — a good moment to ask what they need.` })
  if (owes <= 0 && customer) tips.push({ tone: 'ok', text: 'Nothing owed — a good moment to show something new.' })
  if (tips.length === 0) tips.push({ tone: 'tip', text: 'No notes yet. Add one after this visit so the team knows.' })
  return tips.slice(0, 3)
}

const AVATAR = ['#3a6fd8', '#8a5cd6', '#d0663c', '#2f8f6a', '#7a8597']

/**
 * "Customer insights" bottom sheet from the design canvas (Polish › Check in,
 * Visit record): money owed, last visit and purchase, a few things to keep in
 * mind, and what the team said lately -- so the visit starts informed.
 */
export function CustomerInsightsSheet({
  open,
  insights,
  fallbackName,
  onClose,
  onOpenCustomer,
}: {
  open: boolean
  insights: CustomerInsights
  fallbackName: string
  onClose: () => void
  /** Shown as "Open customer" only when leaving the current screen is allowed (not mid-visit). */
  onOpenCustomer?: () => void
}) {
  if (!open) return null
  const { customer, posts, loading } = insights
  const owes = customer?.balance_usd ?? 0
  const sub = [customer?.business_type, customer?.primary_contact_name ? `owner ${customer.primary_contact_name}` : null, customer?.district_name ?? customer?.province_name]
    .filter(Boolean)
    .join(' · ')
  const facts = [
    { label: 'Owes', value: money(owes), note: owes > 0 && customer?.credit_limit_usd != null ? `limit ${money(customer.credit_limit_usd)}` : owes > 0 ? 'outstanding' : 'nothing due', tone: owes > 0 ? 'text-status-danger' : 'text-status-working' },
    { label: 'Last visit', value: customer?.last_visit_date ? formatDate(customer.last_visit_date) : '—', note: customer?.last_visit_date ? `${daysSince(customer.last_visit_date)} days ago` : '', tone: 'text-neutral-900' },
    { label: 'Last purchase', value: customer?.last_purchase_date ? formatDate(customer.last_purchase_date) : '—', note: '', tone: 'text-neutral-900' },
  ]

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close insights" onClick={onClose} className="absolute inset-0 bg-[rgba(8,10,14,.45)]" />
      <section
        role="dialog"
        aria-label={`${customer?.shop_name ?? fallbackName} insights`}
        className="absolute inset-x-0 bottom-0 flex max-h-[92%] animate-fade-in-up flex-col overflow-hidden rounded-t-3xl bg-neutral-50 shadow-[0_-12px_32px_rgba(0,0,0,.25)]"
      >
        <div className="flex justify-center pt-2">
          <span className="h-[5px] w-10 rounded-full bg-neutral-300" />
        </div>
        <header className="flex items-center gap-3 px-4 pb-3 pt-2.5">
          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-brand-500 text-white">
            <Store className="h-[22px] w-[22px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-bold text-neutral-900">{customer?.shop_name ?? fallbackName}</span>
            {sub && <span className="block truncate text-[13px] text-neutral-500">{sub}</span>}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 rounded-2xl border border-neutral-100 bg-white px-1 py-3 shadow-card">
                {facts.map((f, i) => (
                  <div key={f.label} className={`px-2.5 ${i ? 'border-l border-neutral-100' : ''}`}>
                    <p className="text-[11px] text-neutral-500">{f.label}</p>
                    <p className={`mt-0.5 text-base font-bold ${f.tone}`}>{f.value}</p>
                    {f.note && <p className="truncate text-[11px] text-neutral-500">{f.note}</p>}
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-white px-3.5 py-3 shadow-card">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Before you go in</p>
                {tipsFor(customer, posts).map((tip) => {
                  const S = TIP_STYLE[tip.tone]
                  return (
                    <div key={tip.text} className="flex gap-2.5 py-1.5">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${S.cls}`}>
                        <S.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="text-sm leading-5 text-neutral-900">{tip.text}</span>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-white px-3.5 py-3 shadow-card">
                <div className="flex items-baseline justify-between">
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">Recent discussion</p>
                  <span className="text-xs text-neutral-500">{posts.length}</span>
                </div>
                {posts.length === 0 && <p className="py-2 text-[13px] text-neutral-500">No conversation yet.</p>}
                {posts.map((p, i) => (
                  <div key={p.id} className={`flex gap-2.5 py-2 ${i ? 'border-t border-neutral-100' : ''}`}>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: AVATAR[(p.author_name?.charCodeAt(0) ?? 0) % AVATAR.length] }}
                    >
                      {(p.author_name ?? '?')
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2 text-[13px]">
                        <b className="truncate font-bold text-neutral-900">{p.author_name ?? 'Someone'}</b>
                        <span className="shrink-0 text-neutral-500">{formatDate(p.created_at)}</span>
                      </span>
                      <span className="mt-px line-clamp-3 block text-[13px] leading-[18px] text-neutral-600">{p.body}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-auto grid grid-cols-[1fr_1.4fr] gap-2">
            <a
              href={customer?.primary_contact_phone ? `tel:${customer.primary_contact_phone}` : undefined}
              aria-disabled={!customer?.primary_contact_phone}
              className={`flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] border border-neutral-100 bg-white text-sm font-bold text-neutral-900 ${customer?.primary_contact_phone ? '' : 'pointer-events-none opacity-50'}`}
            >
              <Phone className="h-[17px] w-[17px]" aria-hidden />
              Call owner
            </a>
            {customer?.id && onOpenCustomer && (
              <Link to={`/customers/${customer.id}`} onClick={onOpenCustomer} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] bg-brand-500 text-sm font-bold text-white">
                Open customer
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
