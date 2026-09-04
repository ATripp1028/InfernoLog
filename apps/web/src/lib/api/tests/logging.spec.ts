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

  // The iterating test below can only prove the set works, never that it is
  // complete — it derives its expectations from the same constant. This one
  // names the keys, which is what a missing entry actually looks like: the
  // level page was absent once and went minutes showing pre-write data.
  it.each([
    ['the Log', 'log'],
    ['the demon list', 'demon-list'],
    ['collections, which a completion can drop a level out of', 'collections'],
    ['the user-scoped level page', 'level-page'],
    // The Global Level Page's FAB opens the logging flow for the level it is
    // showing, and the page stays mounted behind the modal — so the write
    // lands on the very view that reports `hasUserProgress`.
    ['the global level page', 'global-level-page'],
  ])('invalidates %s', (_label, key) => {
    expect(INVALIDATE_ON_WRITE.map(([first]) => first)).toContain(key)
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

// A rating-mode switch changes what the SERVER computes for `overallRating`,
// so a cache filled under the old mode is not merely stale — it holds figures
// the new mode would never produce. Left un-invalidated it reads as every
// rating having been deleted.
describe('rating mode switch invalidation', () => {
  it('covers the views whose values the server derives from the mode', () => {
    expect(INVALIDATE_ON_WRITE).toContainEqual(['log'])
    expect(INVALIDATE_ON_WRITE).toContainEqual(['rating-ranking'])
  })
})
