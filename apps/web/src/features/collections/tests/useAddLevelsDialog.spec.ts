import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { CollectionType } from '@infernolog/core'
import type { CollectionDetail } from '@/lib/api/collections'
import type { Level, LevelSearchResult } from '@/lib/api/logging'
import {
  apiError,
  makeCachedLevel,
  makeCollectionDetail,
  makeEntry,
  makeLevel,
  makeResolveResponse,
  makeSearchResult,
  queryWrapper,
  stubEscalation,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/useEscalation', () => ({ useEscalation: vi.fn() }))
vi.mock('@/lib/api/logging', () => ({
  useLevelById: vi.fn(),
  useLevelSearch: vi.fn(),
  useResolveLevel: vi.fn(),
}))
// collectionErrorCode stays real: the LEVEL_ALREADY_COMPLETED copy below is
// only trustworthy if the code is actually read off an ApiError body the way
// the API sends it.
vi.mock('@/lib/api/collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/collections')>()),
  useAddCollectionEntry: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { useEscalation } = await import('@/lib/useEscalation')
const { useLevelById, useLevelSearch, useResolveLevel } =
  await import('@/lib/api/logging')
const { useAddCollectionEntry } = await import('@/lib/api/collections')
const { useAddLevelsDialog } = await import('../useAddLevelsDialog')

let addAsync: ReturnType<typeof vi.fn>
let resolveAsync: ReturnType<typeof vi.fn>
let escalation: ReturnType<typeof stubEscalation>

beforeEach(() => {
  addAsync = vi.fn().mockResolvedValue(undefined)
  resolveAsync = vi.fn().mockResolvedValue(makeResolveResponse())
  escalation = stubEscalation()
  vi.mocked(useAddCollectionEntry).mockReturnValue(
    stubMutation({ mutateAsync: addAsync })
  )
  vi.mocked(useResolveLevel).mockReturnValue(
    stubMutation({ mutateAsync: resolveAsync })
  )
  vi.mocked(useEscalation).mockReturnValue(escalation)
  vi.mocked(useLevelSearch).mockReturnValue(stubQuery<LevelSearchResult[]>())
  vi.mocked(useLevelById).mockReturnValue(stubQuery<Level | null>())
})

const collection = makeCollectionDetail({
  id: 'collection-1',
  name: 'My Collection',
})

function render(
  opts: {
    collection?: CollectionDetail
    completedIds?: Set<string>
    onClose?: Mock<() => void>
    open?: boolean
  } = {}
) {
  const onClose = opts.onClose ?? vi.fn<() => void>()
  const { wrapper } = queryWrapper()
  const view = renderHook(
    ({ open }: { open: boolean }) =>
      useAddLevelsDialog({
        open,
        onClose,
        collection: opts.collection ?? collection,
        completedIds: opts.completedIds,
      }),
    { wrapper, initialProps: { open: opts.open ?? true } }
  )
  return { ...view, onClose }
}

describe('useAddLevelsDialog', () => {
  describe('which section renders', () => {
    it('prompts for input before anything is typed', () => {
      const { result } = render()

      expect(result.current.showEmptyPrompt).toBe(true)
      expect(result.current.showResults).toBe(false)
    })

    it('shows name-search results from two characters on', () => {
      const { result } = render()

      act(() => result.current.updateQuery('a'))
      expect(result.current.showResults).toBe(false)

      act(() => result.current.updateQuery('ab'))
      expect(result.current.showResults).toBe(true)
    })

    // A numeric query is a level id, never a name — it resolves directly.
    it('never runs a name search for a numeric query', () => {
      const { result } = render()

      act(() => result.current.updateQuery('12345'))

      expect(result.current.showResults).toBe(false)
    })

    it('previews a numeric id that is already in the cache', () => {
      vi.mocked(useLevelById).mockReturnValue(
        stubQuery<Level | null>({
          data: makeCachedLevel({ inGameId: '12345' }),
        })
      )
      const { result } = render()

      act(() => result.current.updateQuery('12345'))

      expect(result.current.showCachedPreview).toBe(true)
      expect(result.current.showSeedHint).toBe(false)
    })

    it('offers to fetch an unknown numeric id from RobTop', () => {
      const { result } = render()

      act(() => result.current.updateQuery('12345'))

      expect(result.current.showSeedHint).toBe(true)
    })

    // Otherwise the hint flashes "not in the cache" for every id while its
    // own lookup is still in flight.
    it('withholds the seed hint while the cache lookup is still running', () => {
      vi.mocked(useLevelById).mockReturnValue(
        stubQuery<Level | null>({ isFetching: true })
      )
      const { result } = render()

      act(() => result.current.updateQuery('12345'))

      expect(result.current.showSeedHint).toBe(false)
    })

    it('requires four digits before treating a number as an id', () => {
      const { result } = render()

      act(() => result.current.updateQuery('123'))

      expect(result.current.showSeedHint).toBe(false)
      expect(result.current.showCachedPreview).toBe(false)
      expect(result.current.showEmptyPrompt).toBe(true)
    })

    it('replaces every search section once a level is seeded', async () => {
      const { result } = render()
      act(() => result.current.updateQuery('12345'))

      await act(async () => result.current.seedAndSelect('12345'))

      expect(result.current.seeded).not.toBeNull()
      expect(result.current.showSeedHint).toBe(false)
      expect(result.current.showResults).toBe(false)
      expect(result.current.showEmptyPrompt).toBe(false)
    })
  })

  describe('search results', () => {
    const inCollection = makeSearchResult({ inGameId: 'in-collection' })
    const beaten = makeSearchResult({ inGameId: 'beaten' })
    const addable = makeSearchResult({ inGameId: 'addable' })

    const withResults = () => {
      vi.mocked(useLevelSearch).mockReturnValue(
        stubQuery({ data: [inCollection, beaten, addable] })
      )
      return render({
        collection: makeCollectionDetail({
          ...collection,
          entries: [
            makeEntry({ level: makeLevel({ inGameId: 'in-collection' }) }),
          ],
        }),
        completedIds: new Set(['beaten']),
      })
    }

    // Greyed-out rows can't be clicked, so letting them hold the top slots
    // would waste the (capped) result list.
    it('floats the actionable rows above the greyed-out ones', () => {
      const { result } = withResults()

      expect(result.current.results.map((r) => r.inGameId)).toEqual([
        'addable',
        'in-collection',
        'beaten',
      ])
    })

    it.each([
      ['in-collection', 'Added'],
      ['beaten', 'Already beaten'],
      ['addable', null],
    ])('badges %s as %s', (levelId, badge) => {
      const { result } = withResults()

      expect(result.current.rowBadge(levelId)).toBe(badge)
    })

    // Membership is the more specific fact, and the one the user acts on.
    it('prefers the Added badge when a level is both added and beaten', () => {
      const { result } = render({
        collection: makeCollectionDetail({
          ...collection,
          entries: [makeEntry({ level: makeLevel({ inGameId: 'both' }) })],
        }),
        completedIds: new Set(['both']),
      })

      expect(result.current.rowBadge('both')).toBe('Added')
    })

    it('badges nothing as beaten when no completions were supplied', () => {
      const { result } = render()

      expect(result.current.rowBadge('anything')).toBeNull()
    })
  })

  describe('adding a visible level', () => {
    it('adds it to this collection and confirms by name', async () => {
      const { result, onClose } = render()

      await act(async () => result.current.addLevel('12345', 'Bloodbath'))

      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        levelId: '12345',
      })
      expect(toast.success).toHaveBeenCalledWith(
        'Added Bloodbath to My Collection'
      )
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('confirms an unnamed level generically', async () => {
      const { result } = render()

      await act(async () => result.current.addLevel('12345', null))

      expect(toast.success).toHaveBeenCalledWith('Added level to My Collection')
    })

    it('clears the query and stays open when Add another is on', async () => {
      const { result, onClose } = render()
      act(() => result.current.updateQuery('bloodbath'))
      act(() => result.current.setAddAnother(true))

      await act(async () => result.current.addLevel('12345', 'Bloodbath'))

      expect(result.current.query).toBe('')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('marks the row being added, so only it shows a spinner', async () => {
      let finish: () => void = () => {}
      addAsync.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve
        })
      )
      const { result } = render()

      act(() => result.current.addLevel('12345', 'Bloodbath'))
      await waitFor(() => expect(result.current.addingId).toBe('12345'))

      await act(async () => finish())
      expect(result.current.addingId).toBeNull()
    })

    // Want to Beat only ever holds unbeaten levels — the generic message would
    // leave the user with no idea why the add bounced.
    it('explains the Want to Beat rule when the server rejects a beaten level', async () => {
      addAsync.mockRejectedValue(
        apiError(400, 'LEVEL_ALREADY_COMPLETED', {
          error: 'LEVEL_ALREADY_COMPLETED',
        })
      )
      const { result, onClose } = render()

      await act(async () => result.current.addLevel('12345', 'Bloodbath'))

      expect(toast.error).toHaveBeenCalledWith(
        'Already completed — Want to Beat only holds unbeaten levels'
      )
      expect(onClose).not.toHaveBeenCalled()
    })

    it('surfaces any other API message as-is', async () => {
      addAsync.mockRejectedValue(apiError(409, 'Level already in collection'))
      const { result } = render()

      await act(async () => result.current.addLevel('12345', 'Bloodbath'))

      expect(toast.error).toHaveBeenCalledWith('Level already in collection')
    })

    it('falls back to generic copy for a non-API failure', async () => {
      addAsync.mockRejectedValue(new Error('offline'))
      const { result } = render()

      await act(async () => result.current.addLevel('12345', 'Bloodbath'))

      expect(toast.error).toHaveBeenCalledWith('Could not add that level')
    })
  })

  describe('seeding an unknown id', () => {
    it('holds the fetched level for confirmation instead of adding it', async () => {
      resolveAsync.mockResolvedValue(
        makeResolveResponse({
          level: makeCachedLevel({ inGameId: '12345', name: 'Tidal Wave' }),
        })
      )
      const { result } = render()

      await act(async () => result.current.seedAndSelect('12345'))

      expect(result.current.seeded).toMatchObject({
        inGameId: '12345',
        name: 'Tidal Wave',
        completed: false,
      })
      expect(addAsync).not.toHaveBeenCalled()
      expect(result.current.query).toBe('')
    })

    it('marks a level the user has already beaten', async () => {
      resolveAsync.mockResolvedValue(
        makeResolveResponse({
          existingCompletion: { id: 'completion-1' } as never,
        })
      )
      const { result } = render()

      await act(async () => result.current.seedAndSelect('12345'))

      expect(result.current.seeded?.completed).toBe(true)
    })

    it('points at manual logging when RobTop has no such level', async () => {
      resolveAsync.mockResolvedValue(
        makeResolveResponse({ level: null, fallbackToManual: true })
      )
      const { result } = render()

      await act(async () => result.current.seedAndSelect('12345'))

      expect(result.current.seeded).toBeNull()
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('could not be fetched from the GD servers')
      )
    })

    it.each([
      [apiError(503, 'GD servers unreachable'), 'GD servers unreachable'],
      [new Error('offline'), 'Could not look up that level'],
    ])('toasts when the lookup fails', async (error, expected) => {
      resolveAsync.mockRejectedValue(error)
      const { result } = render()

      await act(async () => result.current.seedAndSelect('12345'))

      expect(toast.error).toHaveBeenCalledWith(expected)
      expect(result.current.seedingId).toBeNull()
    })

    it('announces the fetch, then clears it', async () => {
      let finish: (v: unknown) => void = () => {}
      resolveAsync.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        })
      )
      const { result } = render()

      act(() => result.current.seedAndSelect('12345'))
      await waitFor(() => expect(result.current.seedingId).toBe('12345'))

      await act(async () => finish(makeResolveResponse()))
      expect(result.current.seedingId).toBeNull()
    })
  })

  describe('confirming a seeded level', () => {
    const seed = async (
      opts: { completed?: boolean; collection?: CollectionDetail } = {}
    ) => {
      resolveAsync.mockResolvedValue(
        makeResolveResponse({
          level: makeCachedLevel({ inGameId: '12345', name: 'Tidal Wave' }),
          existingCompletion: opts.completed
            ? ({ id: 'completion-1' } as never)
            : null,
        })
      )
      const view = render(
        opts.collection ? { collection: opts.collection } : {}
      )
      await act(async () => view.result.current.seedAndSelect('12345'))
      return view
    }

    it('adds the held level and closes', async () => {
      const { result, onClose } = await seed()

      await act(async () => result.current.confirmSeeded())

      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        levelId: '12345',
      })
      expect(toast.success).toHaveBeenCalledWith(
        'Added Tidal Wave to My Collection'
      )
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('clears the card for the next id when Add another is on', async () => {
      const { result, onClose } = await seed()
      act(() => result.current.setAddAnother(true))

      await act(async () => result.current.confirmSeeded())

      expect(result.current.seeded).toBeNull()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('reports an add failure without clearing the card', async () => {
      addAsync.mockRejectedValue(apiError(409, 'Already in collection'))
      const { result, onClose } = await seed()

      await act(async () => result.current.confirmSeeded())

      expect(toast.error).toHaveBeenCalledWith('Already in collection')
      expect(result.current.seeded).not.toBeNull()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('blocks a beaten level from Want to Beat', async () => {
      const { result } = await seed({
        completed: true,
        collection: makeCollectionDetail({
          ...collection,
          type: CollectionType.WANT_TO_BEAT,
        }),
      })

      expect(result.current.seededBlocked).toBe(true)
      expect(result.current.canConfirm).toBe(false)
    })

    it('leaves a beaten level unblocked for an ordinary collection', async () => {
      const { result } = await seed({ completed: true })

      expect(result.current.seededBlocked).toBe(false)
      expect(result.current.canConfirm).toBe(true)
    })

    // Being beaten is only disqualifying for Want to Beat. The confirm
    // handler used to refuse any beaten level, leaving an ordinary
    // collection with an enabled button that silently did nothing.
    it('adds a beaten level to an ordinary collection', async () => {
      const { result, onClose } = await seed({ completed: true })

      await act(async () => result.current.confirmSeeded())

      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        levelId: '12345',
      })
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('refuses to add a beaten level to Want to Beat', async () => {
      const { result, onClose } = await seed({
        completed: true,
        collection: makeCollectionDetail({
          ...collection,
          type: CollectionType.WANT_TO_BEAT,
        }),
      })

      await act(async () => result.current.confirmSeeded())

      expect(addAsync).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })

    // A level has to be seeded before it can be logged, so a freshly-resolved
    // id normally has no completion at all — the guard only bites for an id
    // the user seeded and beat in an earlier session.
    it('adds an unbeaten seeded level to Want to Beat', async () => {
      const { result } = await seed({
        collection: makeCollectionDetail({
          ...collection,
          type: CollectionType.WANT_TO_BEAT,
        }),
      })

      expect(result.current.canConfirm).toBe(true)

      await act(async () => result.current.confirmSeeded())

      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        levelId: '12345',
      })
    })

    it('flags a seeded level that is already in the collection', async () => {
      const { result } = await seed({
        collection: makeCollectionDetail({
          ...collection,
          entries: [makeEntry({ level: makeLevel({ inGameId: '12345' }) })],
        }),
      })

      expect(result.current.seededAlreadyAdded).toBe(true)
    })

    it('lets the user back out of the seeded card', async () => {
      const { result } = await seed()

      act(() => result.current.clearSeeded())

      expect(result.current.seeded).toBeNull()
    })

    it('confirms nothing when no level is held', async () => {
      const { result } = render()

      await act(async () => result.current.confirmSeeded())

      expect(addAsync).not.toHaveBeenCalled()
      expect(result.current.canConfirm).toBe(false)
    })
  })

  describe('submitting the query', () => {
    it('ignores Enter on a name query — the user picks a result instead', () => {
      const { result } = render()
      act(() => result.current.updateQuery('bloodbath'))

      act(() => result.current.submitQuery())

      expect(addAsync).not.toHaveBeenCalled()
      expect(resolveAsync).not.toHaveBeenCalled()
    })

    it('adds a cached level straight away', async () => {
      vi.mocked(useLevelById).mockReturnValue(
        stubQuery<Level | null>({
          data: makeCachedLevel({ inGameId: '12345', name: 'Bloodbath' }),
        })
      )
      const { result } = render()
      act(() => result.current.updateQuery('12345'))

      await act(async () => result.current.submitQuery())

      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        levelId: '12345',
      })
      expect(resolveAsync).not.toHaveBeenCalled()
    })

    it('seeds an id that is not in the cache', async () => {
      const { result } = render()
      act(() => result.current.updateQuery('12345'))

      await act(async () => result.current.submitQuery())

      expect(resolveAsync).toHaveBeenCalledWith('12345')
      expect(addAsync).not.toHaveBeenCalled()
    })

    it('ignores whitespace around an id', async () => {
      const { result } = render()
      act(() => result.current.updateQuery('  12345  '))

      await act(async () => result.current.submitQuery())

      expect(resolveAsync).toHaveBeenCalledWith('12345')
    })
  })

  // A GD-server search result row already showed name, creator, id and
  // difficulty, so seeding it is a step to finish rather than a second thing
  // to confirm — only a raw typed id gets the confirmation card.
  describe('picking a GD-search result', () => {
    beforeEach(() => {
      resolveAsync.mockResolvedValue(
        makeResolveResponse({
          level: makeCachedLevel({ inGameId: '12345', name: 'Tidal Wave' }),
        })
      )
    })

    it('adds the level outright instead of holding it for confirmation', async () => {
      const { result, onClose } = render()

      await act(async () => result.current.seedAndAdd('12345'))

      expect(resolveAsync).toHaveBeenCalledWith('12345')
      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        levelId: '12345',
      })
      expect(result.current.seeded).toBeNull()
      expect(toast.success).toHaveBeenCalledWith(
        'Added Tidal Wave to My Collection'
      )
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('stays open for the next pick when Add another is on', async () => {
      const { result, onClose } = render()
      act(() => result.current.setAddAnother(true))

      await act(async () => result.current.seedAndAdd('12345'))

      expect(addAsync).toHaveBeenCalledOnce()
      expect(onClose).not.toHaveBeenCalled()
    })

    // The regression this guards: the indicator used to replace the results
    // list, and clearing it the moment the seed resolved put that list back on
    // screen for the length of the add — so the row the user clicked
    // reappeared and then the dialog closed. It now sits in the row itself,
    // which has to stay marked across both waits with the list left alone.
    it('keeps the clicked row spinning through the add that follows the seed', async () => {
      let finishAdd: () => void = () => {}
      addAsync.mockReturnValue(
        new Promise<void>((resolve) => {
          finishAdd = resolve
        })
      )
      const { result } = render()
      act(() => result.current.updateQuery('tidal'))

      act(() => result.current.seedAndAdd('12345'))

      await waitFor(() => expect(result.current.addingId).toBe('12345'))
      expect(result.current.isAdding).toBe(true)
      expect(result.current.showResults).toBe(true)

      await act(async () => finishAdd())
      expect(result.current.addingId).toBeNull()
    })

    // The seed is the half of the wait no mutation reports as pending, so a
    // failure there has to clear the row marker itself.
    it('marks the row while the seed alone is in flight', async () => {
      let finishSeed: (v: unknown) => void = () => {}
      resolveAsync.mockReturnValue(
        new Promise((resolve) => {
          finishSeed = resolve
        })
      )
      const { result } = render()
      act(() => result.current.updateQuery('tidal'))

      act(() => result.current.seedAndAdd('12345'))

      await waitFor(() => expect(result.current.addingId).toBe('12345'))

      await act(async () => finishSeed(makeResolveResponse({ level: null })))
      expect(result.current.addingId).toBeNull()
    })

    it('reports a failed fetch and adds nothing', async () => {
      resolveAsync.mockRejectedValue(apiError(503, 'GD servers unreachable'))
      const { result } = render()

      await act(async () => result.current.seedAndAdd('12345'))

      expect(toast.error).toHaveBeenCalledWith('GD servers unreachable')
      expect(addAsync).not.toHaveBeenCalled()
      expect(result.current.addingId).toBeNull()
    })

    it('reports a failed add without stranding a confirmation card', async () => {
      addAsync.mockRejectedValue(apiError(500, 'boom'))
      const { result, onClose } = render()

      await act(async () => result.current.seedAndAdd('12345'))

      expect(toast.error).toHaveBeenCalledWith('boom')
      expect(result.current.seeded).toBeNull()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('GD escalation', () => {
    // Escalation is an action, never a mode: editing the query must re-require
    // an explicit confirm rather than silently re-escalating.
    it('drops a prior escalation whenever the query changes', () => {
      const { result } = render()

      act(() => result.current.updateQuery('bloodbath'))

      expect(escalation.clear).toHaveBeenCalled()
    })
  })

  it('resets everything when the dialog reopens', async () => {
    const { result, rerender } = render()
    act(() => result.current.updateQuery('bloodbath'))
    act(() => result.current.setAddAnother(true))
    await act(async () => result.current.seedAndSelect('12345'))

    rerender({ open: false })
    rerender({ open: true })

    expect(result.current.query).toBe('')
    expect(result.current.seeded).toBeNull()
    expect(result.current.addAnother).toBe(false)
    expect(result.current.seedingId).toBeNull()
    expect(result.current.addingId).toBeNull()
    expect(escalation.clear).toHaveBeenCalled()
  })
})
