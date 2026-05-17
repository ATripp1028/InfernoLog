import { useEffect, useRef } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import { SETTINGS_SAVE_MUTATION_KEYS } from '@/lib/api/me'

// One "Saved" toast per burst.
//
// The settings page fires many small mutations as the user pokes at it
// (every toggle, every select, every drag). Showing a toast for each one
// is noisy and tells the user nothing they couldn't see by looking at the
// control. Instead we wait until *all* save mutations have settled, then
// show a single "Saved" toast — unless any of them errored, in which case
// the per-mutation handlers already showed an error toast and we stay
// quiet (no point telling someone "Saved" right after telling them
// something failed).
//
// Mount this once at the top of the settings page.
export function useSettingsSaveNotifier() {
  const queryClient = useQueryClient()

  // A "session" begins when the count of pending save mutations rises
  // above zero and ends when it returns to zero. We track per-session
  // whether anything errored.
  const sessionRef = useRef<{ active: boolean; hadError: boolean }>({
    active: false,
    hadError: false,
  })

  // Subscribe to the mutation cache to catch error transitions in real
  // time. useIsMutating only reports the pending *count*, not statuses.
  useEffect(() => {
    const cache = queryClient.getMutationCache()
    return cache.subscribe((event) => {
      if (!event || !event.mutation) return
      if (!isTrackedMutation(event.mutation.options.mutationKey)) return
      if (event.mutation.state.status === 'error') {
        sessionRef.current.hadError = true
      }
    })
  }, [queryClient])

  // Count of currently-pending save mutations across the tracked keys.
  // useIsMutating triggers re-renders on transitions which drives the
  // burst-end detection below.
  const pending = useIsMutating({
    predicate: (m) => isTrackedMutation(m.options.mutationKey),
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
      if (!hadError) toast.success('Saved')
    }
    prevPending.current = pending
  }, [pending])
}

function isTrackedMutation(
  mutationKey: ReadonlyArray<unknown> | undefined
): boolean {
  if (!mutationKey || mutationKey.length === 0) return false
  const head = mutationKey[0]
  if (typeof head !== 'string') return false
  return SETTINGS_SAVE_MUTATION_KEYS.some((key) => key[0] === head)
}
