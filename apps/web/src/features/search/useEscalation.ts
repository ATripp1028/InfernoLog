import { useCallback, useState } from 'react'
import { useGdSearch, type GdSearchResponse } from '@/lib/api/logging'

// Shared GD-server escalation state, reused by every cache-search call site
// (toolbar, logging-flow entry, collections add). Tracks *which* query was
// escalated so that editing the query after an escalated search drops the
// result and re-requires an explicit confirm — escalation is an action, never
// a mode the user is left "in" (locked decision 2.3).
export function useEscalation() {
  const gdSearch = useGdSearch()
  const [escalatedQuery, setEscalatedQuery] = useState<string | null>(null)

  const escalate = useCallback(
    (q: string) => {
      setEscalatedQuery(q)
      gdSearch.mutate(q)
    },
    [gdSearch]
  )

  // Call whenever the query changes. Clears any prior escalation so the offer
  // reappears and the next escalation needs its own confirmation.
  const clear = useCallback(() => {
    setEscalatedQuery((prev) => {
      if (prev !== null) gdSearch.reset()
      return null
    })
  }, [gdSearch])

  return {
    /** The query currently escalated, or null. */
    escalatedQuery,
    escalate,
    clear,
    isPending: gdSearch.isPending,
    /** A non-503 failure (unexpected). 503 resolves to a 'unreachable' result. */
    isError: gdSearch.isError,
    result: (gdSearch.data ?? null) as GdSearchResponse | null,
  }
}
