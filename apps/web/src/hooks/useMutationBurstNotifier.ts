import { useEffect, useRef } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'

/**
 * Shows one success toast per "burst" of mutations sharing one of the given
 * keys, rather than one toast per mutation — for pages that fire many small
 * mutations in quick succession (every toggle, every drag) where a toast per
 * mutation would be noisy. A burst starts when the tracked pending count
 * rises above zero and ends when it falls back to zero; the toast is
 * skipped if anything in the burst errored, since the per-mutation onError
 * already toasted.
 *
 * `mutationKeys` should be a stable (module-level) array — it's used as an
 * effect dependency, and a fresh array literal on every render would tear
 * down and resubscribe the mutation cache listener each time.
 */
export function useMutationBurstNotifier(
  mutationKeys: ReadonlyArray<readonly string[]>,
  successMessage: string
) {
  const queryClient = useQueryClient()

  // A session begins when the count of pending tracked mutations rises
  // above zero and ends when it returns to zero. We track per-session
  // whether anything errored.
  const sessionRef = useRef<{ active: boolean; hadError: boolean }>({
    active: false,
    hadError: false,
  })

  const isTracked = (key: ReadonlyArray<unknown> | undefined) => {
    if (!key || key.length === 0) return false
    const head = key[0]
    if (typeof head !== 'string') return false
    return mutationKeys.some((k) => k[0] === head)
  }

  // Subscribe to the mutation cache to catch error transitions in real
  // time. useIsMutating only reports the pending *count*, not statuses.
  useEffect(() => {
    const cache = queryClient.getMutationCache()
    return cache.subscribe((event) => {
      if (!event || !event.mutation) return
      if (!isTracked(event.mutation.options.mutationKey)) return
      if (event.mutation.state.status === 'error') {
        sessionRef.current.hadError = true
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, mutationKeys])

  // Count of currently-pending tracked mutations. useIsMutating triggers
  // re-renders on transitions which drives the burst-end detection below.
  const pending = useIsMutating({
    predicate: (m) => isTracked(m.options.mutationKey),
  })

  const prevPending = useRef(0)
  useEffect(() => {
    if (pending > 0) {
      sessionRef.current.active = true
    } else if (prevPending.current > 0 && sessionRef.current.active) {
      // Pending count fell to 0 — the burst just ended.
      const { hadError } = sessionRef.current
      sessionRef.current.active = false
      sessionRef.current.hadError = false
      if (!hadError) toast.success(successMessage)
    }
    prevPending.current = pending
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])
}
