import { useEffect, useState } from 'react'
import { displayName } from '@/lib/displayName'
import type { Colleague } from './conversationMeta'
import { conversationsService } from './conversationsService'

let cache: Promise<Colleague[]> | null = null

/** Active colleagues for @mentions and notify chips -- fetched once per session. */
export function useColleagues(): Colleague[] {
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  useEffect(() => {
    let cancelled = false
    if (!cache) {
      cache = conversationsService.colleagues().catch((e) => {
        cache = null
        throw e
      })
    }
    cache
      .then((list) => {
        if (!cancelled) setColleagues(list)
      })
      .catch(() => {
        // Mentions just won't autocomplete; posting still works.
      })
    return () => {
      cancelled = true
    }
  }, [])
  return colleagues
}

export function colleagueName(c: Pick<Colleague, 'full_name' | 'nickname'>): string {
  return displayName(c.full_name, c.nickname)
}
