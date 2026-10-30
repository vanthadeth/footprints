import { useEffect, useState } from 'react'
import { customerBookService } from '@/features/customers/customerBookService'
import type { ProvinceCounts } from './ProvinceSheet'

/** Customers per province (and how many are not visited in 60+ days), for the trip screens. Empty until it loads or if it fails. */
export function useProvinceCounts(): ProvinceCounts {
  const [counts, setCounts] = useState<ProvinceCounts>({})
  useEffect(() => {
    let cancelled = false
    customerBookService
      .summary({})
      .then((rows) => {
        if (cancelled) return
        const c: ProvinceCounts = {}
        for (const row of rows) {
          const e = (c[row.province_code] ??= { total: 0, stale: 0 })
          e.total += row.n
          if (row.bucket === '60+' || row.bucket === 'never') e.stale += row.n
        }
        setCounts(c)
      })
      .catch(() => {
        // Pills just show no count.
      })
    return () => {
      cancelled = true
    }
  }, [])
  return counts
}
