import { useEffect, useState } from 'react'
import { supabase } from '@footprints/shared/lib/supabase'
import type { InvoiceRow } from './timeline'

/** The customer's synced invoices (invoice_details: with the due date worked out from the payment term), newest first. */
export function useCustomerInvoices(customerId: string | undefined) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setLoading(true)
    ;(supabase.from('invoice_details' as never) as unknown as { select: (c: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> } } } })
      .select('id, inv_no, inv_date, inv_value, is_khr, status, sent_date, received_date, so_sheet_id, due_date')
      .eq('customer_id', customerId)
      .order('inv_date', { ascending: false })
      .limit(200)
      .then(({ data, error: e }) => {
        if (cancelled) return
        if (e) setError(e.message)
        else setRows((data ?? []) as InvoiceRow[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])
  return { rows, loading, error }
}
