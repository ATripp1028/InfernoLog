import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { INVALIDATE_ON_EVENT, invalidateOnEvent } from '../activity'
import { INVALIDATE_ON_WRITE, invalidateOnWrite } from '../logging'

// The second invalidation set, and the relationship between the two that keeps
// them from drifting: a progress write is also an event, so invalidateOnWrite
// has to cover both sets — but not the reverse, since a ranking move or a
// rating-config save emits an event without touching the List or collections.
// That asymmetry is the whole reason there are two sets rather than one wide
// one, and it is exactly what a later "just add it to the other list" edit
// would quietly undo.

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

async function refetchAll(
  keys: ReadonlyArray<readonly string[]>,
  invalidate: (client: QueryClient) => Promise<unknown>
) {
  const queryClient = new QueryClient()
  const queries = keys.map((key) => ({
    key,
    ...pendingQuery(queryClient, key),
  }))
  for (const q of queries) q.state.value = 'after'

  const invalidated = invalidate(queryClient)
  for (const q of queries) q.release()
  await invalidated

  const results = queries.map((q) =>
    queryClient.getQueryData(q.key as unknown[])
  )
  for (const q of queries) q.unsubscribe()
  return results
}

describe('invalidateOnEvent', () => {
  it('covers every surface that reads the activity log', async () => {
    const results = await refetchAll(INVALIDATE_ON_EVENT, invalidateOnEvent)
    expect(results).toEqual(INVALIDATE_ON_EVENT.map(() => 'after'))
  })

  it('refetches a surface whose first load is still in flight', async () => {
    // Without the cancel pass the app still refetches, still resolves and still
    // renders — with data from before the write, for a whole staleTime.
    const queryClient = new QueryClient()
    const { state, release, unsubscribe } = pendingQuery(queryClient, [
      'activity',
    ])

    state.value = 'after'
    const invalidated = invalidateOnEvent(queryClient)
    release()
    await invalidated

    expect(state.calls).toBe(2)
    expect(queryClient.getQueryData(['activity'])).toBe('after')
    unsubscribe()
  })

  it('leaves the views a progress write owns alone', () => {
    // A ranking move and a rating-config save both go through this set, and
    // neither has any reason to refetch the Log or collections. Widening the
    // older set instead of adding this one is what that would cost.
    //
    // Assert against INVALIDATE_ON_WRITE rather than a hand-written list of
    // key names: this guard read `'list'`/`'ranking'` for a while after those
    // views were renamed to `'log'`/`'demon-list'`, so it passed no matter
    // what was in the set.
    const writeOnly = INVALIDATE_ON_WRITE.map(([first]) => first).filter(
      (key) => key !== 'level-page' && key !== 'global-level-page'
    )
    expect(writeOnly).not.toHaveLength(0)
    for (const key of writeOnly) {
      expect(INVALIDATE_ON_EVENT.flat()).not.toContain(key)
    }
  })
})

describe('invalidateOnWrite', () => {
  it('also refetches the activity surfaces, because a progress write is an event', async () => {
    const results = await refetchAll(
      [...INVALIDATE_ON_WRITE, ...INVALIDATE_ON_EVENT],
      invalidateOnWrite
    )
    expect(results.every((r) => r === 'after')).toBe(true)
  })
})
