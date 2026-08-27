import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { INVALIDATE_ON_WRITE, invalidateOnWrite } from '../logging'

// Covers the cancel pass in invalidateOnWrite, which nothing else can catch:
// without it the app still refetches, still resolves, and still renders — with
// data from before the write, for a whole staleTime.

/** An active query whose first fetch stays in flight until `release()`. */
function pendingQuery(queryClient: QueryClient, key: readonly string[]) {
  const state = { value: 'before', calls: 0 }
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))

  const observer = new QueryObserver(queryClient, {
    queryKey: key as unknown[],
    queryFn: async () => {
      state.calls++
      if (state.calls === 1) await held
      return state.value
    },
  })
  // Subscribing is what makes the query active — invalidateQueries only
  // refetches active queries.
  const unsubscribe = observer.subscribe(() => {})

  return { state, release, unsubscribe }
}

describe('invalidateOnWrite', () => {
  it('refetches a view whose first load is still in flight, so the write is visible', async () => {
    const queryClient = new QueryClient()
    const { state, release, unsubscribe } = pendingQuery(queryClient, [
      'demon-list',
    ])

    // The write lands while that first fetch is still open: its response was
    // issued before the write and cannot contain it.
    state.value = 'after'
    const invalidated = invalidateOnWrite(queryClient)
    release()
    await invalidated

    expect(state.calls).toBe(2)
    expect(queryClient.getQueryData(['demon-list'])).toBe('after')
    unsubscribe()
  })

  it('covers every view a write can change', async () => {
    const queryClient = new QueryClient()
    const queries = INVALIDATE_ON_WRITE.map((key) => ({
      key,
      ...pendingQuery(queryClient, key),
    }))

    for (const q of queries) {
      q.state.value = 'after'
    }
    const invalidated = invalidateOnWrite(queryClient)
    for (const q of queries) q.release()
    await invalidated

    for (const q of queries) {
      expect(queryClient.getQueryData(q.key as unknown[])).toBe('after')
      q.unsubscribe()
    }
  })
})
