import { useEffect, useState } from 'react'
import { customersService, type CustomerDirectoryRow } from '@/features/customers/customersService'
import { conversationsService, type PostRow } from '@/features/conversations/conversationsService'
import { formatDate } from '@/lib/datetime'

export interface CustomerInsights {
  customer: CustomerDirectoryRow | null
  posts: PostRow[]
  loading: boolean
}

/** The customer's directory row plus their latest few conversation posts -- what "Know before you go in" draws on. */
export function useCustomerInsights(customerId: string | null): CustomerInsights {
  const [state, setState] = useState<CustomerInsights>({ customer: null, posts: [], loading: !!customerId })
  useEffect(() => {
    if (!customerId) {
      setState({ customer: null, posts: [], loading: false })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    Promise.all([customersService.get(customerId).catch(() => null), conversationsService.feed(customerId, 3).catch(() => [] as PostRow[])]).then(
      ([customer, posts]) => !cancelled && setState({ customer, posts, loading: false })
    )
    return () => {
      cancelled = true
    }
  }, [customerId])
  return state
}

export const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

/** One line under the "Know before you go in" button: what matters most, in a few words. */
export function insightsTeaser({ customer, posts }: CustomerInsights): string {
  const bits: string[] = []
  if (customer?.balance_usd && customer.balance_usd > 0) bits.push(`Owes ${money(customer.balance_usd)}`)
  if (customer?.last_visit_date) bits.push(`last visit ${formatDate(customer.last_visit_date)}`)
  if (posts[0]?.author_name) bits.push(`${posts[0].author_name.split(' ')[0]} left a note`)
  return bits.length ? bits.join(' · ') : 'Last visit and team notes'
}
