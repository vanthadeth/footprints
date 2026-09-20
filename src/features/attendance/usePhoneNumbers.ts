import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** Batched phone_primary lookup for a set of user ids (e.g. each attendance session's user_id). Every role can already read any user's phone_primary (user:view is scope 'any' for every role -- verified against role_permissions), so this needs no new RLS. */
export function usePhoneNumbers(userIds: (string | null)[]): Record<string, string | null> {
  const [phones, setPhones] = useState<Record<string, string | null>>({})
  const key = [...new Set(userIds.filter((id): id is string => !!id))].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    supabase
      .from('users')
      .select('id, phone_primary')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return
        setPhones((prev) => ({ ...prev, ...Object.fromEntries(data.map((u) => [u.id, u.phone_primary])) }))
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return phones
}
