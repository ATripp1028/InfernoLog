import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { CollectionType } from '@infernolog/core'
import type { CollectionDetail, CollectionSummary } from '@/lib/api/collections'
import type { Level, LevelSearchResult } from '@/lib/api/logging'
import {
  apiError,
  makeCachedLevel,
  makeCollectionDetail,
  makeCollectionSummary,
  makeEntry,
  makeLevel,
  makeResolveResponse,
  makeSearchResult,
  queryWrapper,
  stubEscalation,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'
import type { PickedLevel } from '../useAddToCollectionDialog'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/features/search/useEscalation', () => ({ useEscalation: vi.fn() }))
vi.mock('@/lib/api/list', () => ({ useMyProgress: vi.fn() }))
vi.mock('@/lib/api/logging', () => ({
  useLevelById: vi.fn(),
  useLevelSearch: vi.fn(),
  useResolveLevel: vi.fn(),
}))
// collectionErrorCode stays real — see useAddLevelsDialog.spec.ts.
vi.mock('@/lib/api/collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/collections')>()),
  useAddCollectionEntry: vi.fn(),
  useCollections: vi.fn(),
  useCollectionDetails: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { useEscalation } = await import('@/features/search/useEscalation')
const { useMyProgress } = await import('@/lib/api/list')
const { useLevelById, useLevelSearch, useResolveLevel } =
  await import('@/lib/api/logging')
const { useAddCollectionEntry, useCollectionDetails, useCollections } =
  await import('@/lib/api/collections')
const { useAddToCollectionDialog } = await import('../useAddToCollectionDialog')

const wantToBeat = makeCollectionSummary({
  id: 'wtb',
  name: 'Want to Beat',
  type: CollectionType.WANT_TO_BEAT,
})
const favorites = makeCollectionSummary({
  id: 'fav',
  name: 'Favorites',
  type: CollectionType.FAVORITES,
})
const demons = makeCollectionSummary({
  id: 'demons',
  name: 'Extreme Demons',
  type: CollectionType.CUSTOM,
})

const level: PickedLevel = {
  inGameId: '12345',
  name: 'Tidal Wave',
  creator: 'OniLink',
  inGameDifficulty: 'EXTREME_DEMON',
  featured: true,
  epicValue: 2,
  isRated: true,
}

let addAsync: ReturnType<typeof vi.fn>
let resolveAsync: ReturnType<typeof vi.fn>
let escalation: ReturnType<typeof stubEscalation>

/** Stands in for `useMyProgress` — only the completion status is read. */
function progressWith(
  completedIds: string[]
): ReturnType<typeof useMyProgress> {
  return stubQuery({
    data: completedIds.map((inGameId) => ({
      status: 'COMPLETED',
      level: { inGameId },
    })),
  }) as ReturnType<typeof useMyProgress>
}

/** Stands in for `useCollectionDetails`, whose results are positional. */
function detailsFor(details: (CollectionDetail | undefined)[]) {
  vi.mocked(useCollectionDetails).mockReturnValue(
    details.map((data) => stubQuery({ data })) as never
  )
}

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
  vi.mocked(useCollections).mockReturnValue(
    stubQuery<CollectionSummary[]>({ data: [wantToBeat, favorites, demons] })
  )
  vi.mocked(useMyProgress).mockReturnValue(progressWith([]))
  detailsFor([undefined, undefined, undefined])
})

function render(
  opts: {
    preselectedLevel?: PickedLevel
    onClose?: Mock<() => void>
    open?: boolean
  } = {}
) {
  const onClose = opts.onClose ?? vi.fn<() => void>()
  const { wrapper } = queryWrapper()
  const view = renderHook(
    ({ open }: { open: boolean }) =>
      useAddToCollectionDialog({
        open,
        onClose,
        preselectedLevel: opts.preselectedLevel,
      }),
    { wrapper, initialProps: { open: opts.open ?? true } }
  )
  return { ...view, onClose }
}

/** Reaches the picker with `level` chosen, from the search step. */
function renderOnPickStep() {
  const view = render()
  act(() => view.result.current.selectLevel(level))
  return view
}

describe('useAddToCollectionDialog', () => {
  describe('the two steps', () => {
    it('opens on level search when the caller supplied no level', () => {
      const { result } = render()

      expect(result.current.step).toBe('search')
      expect(result.current.pickedLevel).toBeNull()
    })

    it('skips straight to the picker for a preselected level', () => {
      const { result } = render({ preselectedLevel: level })

      expect(result.current.step).toBe('pick')
      expect(result.current.pickedLevel).toEqual(level)
    })

    // Step 1 was never shown for a preselected level, so there is nothing to
    // go back to.
    it('offers no way back when the level came from the caller', () => {
      const { result } = render({ preselectedLevel: level })

      expect(result.current.canGoBack).toBe(false)
    })

    it('offers a way back once the user picks a level themselves', () => {
      const { result } = renderOnPickStep()

      expect(result.current.step).toBe('pick')
      expect(result.current.canGoBack).toBe(true)
    })

    it('returns to search on the way back', () => {
      const { result } = renderOnPickStep()

      act(() => result.current.goBackToSearch())

      expect(result.current.step).toBe('search')
    })

    it('starts the picker clean for each newly chosen level', () => {
      const { result } = renderOnPickStep()
      act(() => result.current.setCollectionQuery('fav'))
      act(() => result.current.toggleCollection('fav', true))

      act(() => result.current.selectLevel({ ...level, inGameId: '999' }))

      expect(result.current.collectionQuery).toBe('')
      expect(result.current.selectedIds.size).toBe(0)
    })

    // Every collection's entries have to be fetched to know where the level
    // already is — not worth doing until the user is actually looking at them.
    it('defers loading collection contents until the picker is reached', () => {
      const { result } = render()

      expect(useCollectionDetails).toHaveBeenLastCalledWith(
        ['wtb', 'fav', 'demons'],
        false
      )

      act(() => result.current.selectLevel(level))

      expect(useCollectionDetails).toHaveBeenLastCalledWith(
        ['wtb', 'fav', 'demons'],
        true
      )
    })
  })

  describe('level search', () => {
    it('prompts for input before anything is typed', () => {
      const { result } = render()

      expect(result.current.showEmptyPrompt).toBe(true)
    })

    it('shows name-search results from two characters on', () => {
      const { result } = render()

      act(() => result.current.updateLevelQuery('ti'))

      expect(result.current.showResults).toBe(true)
    })

    it('previews a numeric id that is already in the cache', () => {
      vi.mocked(useLevelById).mockReturnValue(
        stubQuery<Level | null>({
          data: makeCachedLevel({ inGameId: '12345' }),
        })
      )
      const { result } = render()

      act(() => result.current.updateLevelQuery('12345'))

      expect(result.current.showCachedPreview).toBe(true)
      expect(result.current.showSeedHint).toBe(false)
    })

    it('offers to fetch an unknown numeric id from RobTop', () => {
      const { result } = render()

      act(() => result.current.updateLevelQuery('12345'))

      expect(result.current.showSeedHint).toBe(true)
    })

    it('withholds the seed hint while the cache lookup is still running', () => {
      vi.mocked(useLevelById).mockReturnValue(
        stubQuery<Level | null>({ isFetching: true })
      )
      const { result } = render()

      act(() => result.current.updateLevelQuery('12345'))

      expect(result.current.showSeedHint).toBe(false)
    })

    // This dialog only picks a level; nothing here is un-addable yet, so no
    // result is greyed out or reordered.
    it('leaves the server relevance order alone', () => {
      const results = [
        makeSearchResult({ inGameId: 'a' }),
        makeSearchResult({ inGameId: 'b' }),
        makeSearchResult({ inGameId: 'c' }),
      ]
      vi.mocked(useLevelSearch).mockReturnValue(stubQuery({ data: results }))
      const { result } = render()

      expect(result.current.results.map((r) => r.inGameId)).toEqual([
        'a',
        'b',
        'c',
      ])
    })

    it('drops a prior escalation whenever the query changes', () => {
      const { result } = render()

      act(() => result.current.updateLevelQuery('tidal'))

      expect(escalation.clear).toHaveBeenCalled()
    })

    describe('resolving a raw id', () => {
      it('holds the fetched level for confirmation rather than picking it', async () => {
        resolveAsync.mockResolvedValue(
          makeResolveResponse({
            level: makeCachedLevel({ inGameId: '12345', name: 'Tidal Wave' }),
          })
        )
        const { result } = render()

        await act(async () => result.current.seedAndPick('12345'))

        expect(result.current.seededLevel).toMatchObject({
          inGameId: '12345',
          name: 'Tidal Wave',
          completed: false,
        })
        expect(result.current.step).toBe('search')
        expect(result.current.levelQuery).toBe('')
      })

      it('marks a level the user has already beaten', async () => {
        resolveAsync.mockResolvedValue(
          makeResolveResponse({
            existingCompletion: { id: 'completion-1' } as never,
          })
        )
        const { result } = render()

        await act(async () => result.current.seedAndPick('12345'))

        expect(result.current.seededLevel?.completed).toBe(true)
      })

      it('points at manual logging when RobTop has no such level', async () => {
        resolveAsync.mockResolvedValue(makeResolveResponse({ level: null }))
        const { result } = render()

        await act(async () => result.current.seedAndPick('12345'))

        expect(result.current.seededLevel).toBeNull()
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

        await act(async () => result.current.seedAndPick('12345'))

        expect(toast.error).toHaveBeenCalledWith(expected)
        expect(result.current.seedingId).toBeNull()
      })

      it('marks the row being seeded, then clears it', async () => {
        let finish: (v: unknown) => void = () => {}
        resolveAsync.mockReturnValue(
          new Promise((resolve) => {
            finish = resolve
          })
        )
        const { result } = render()

        act(() => result.current.seedAndPick('12345'))
        await waitFor(() => expect(result.current.seedingId).toBe('12345'))

        await act(async () => finish(makeResolveResponse()))
        expect(result.current.seedingId).toBeNull()
      })

      it('lets the user back out of the seeded card', async () => {
        const { result } = render()
        await act(async () => result.current.seedAndPick('12345'))

        act(() => result.current.clearSeededLevel())

        expect(result.current.seededLevel).toBeNull()
      })
    })

    // A GD-server search result row already showed name, creator, id and
    // difficulty, so picking one goes straight to step 2 — only a raw typed id
    // gets the confirmation card.
    describe('picking a GD-search result', () => {
      it('goes straight to the collection picker', async () => {
        resolveAsync.mockResolvedValue(
          makeResolveResponse({
            level: makeCachedLevel({ inGameId: '12345', name: 'Tidal Wave' }),
          })
        )
        const { result } = render()
        act(() => result.current.updateLevelQuery('tidal'))

        await act(async () => result.current.seedAndSelect('12345'))

        expect(result.current.step).toBe('pick')
        expect(result.current.pickedLevel).toMatchObject({
          inGameId: '12345',
          name: 'Tidal Wave',
        })
        expect(result.current.seededLevel).toBeNull()
        // The query survives so Back returns to the same GD results.
        expect(result.current.levelQuery).toBe('tidal')
      })

      it("carries the level's completion through to the picker", async () => {
        resolveAsync.mockResolvedValue(
          makeResolveResponse({
            existingCompletion: { id: 'completion-1' } as never,
          })
        )
        const { result } = render()

        await act(async () => result.current.seedAndSelect('12345'))

        expect(result.current.pickedLevel?.completed).toBe(true)
      })

      it('stays on the search step when the fetch fails', async () => {
        resolveAsync.mockRejectedValue(apiError(503, 'GD servers unreachable'))
        const { result } = render()

        await act(async () => result.current.seedAndSelect('12345'))

        expect(toast.error).toHaveBeenCalledWith('GD servers unreachable')
        expect(result.current.step).toBe('search')
        expect(result.current.pickedLevel).toBeNull()
        expect(result.current.seedingId).toBeNull()
      })
    })

    describe('submitting the query', () => {
      it('ignores Enter on a name query — the user picks a result instead', () => {
        const { result } = render()
        act(() => result.current.updateLevelQuery('tidal'))

        act(() => result.current.submitLevelQuery())

        expect(result.current.step).toBe('search')
        expect(resolveAsync).not.toHaveBeenCalled()
      })

      it('picks a cached level straight away', () => {
        const cached = makeCachedLevel({ inGameId: '12345' })
        vi.mocked(useLevelById).mockReturnValue(
          stubQuery<Level | null>({ data: cached })
        )
        const { result } = render()
        act(() => result.current.updateLevelQuery('12345'))

        act(() => result.current.submitLevelQuery())

        expect(result.current.step).toBe('pick')
        expect(result.current.pickedLevel).toBe(cached)
        expect(resolveAsync).not.toHaveBeenCalled()
      })

      it('resolves an id that is not in the cache', async () => {
        const { result } = render()
        act(() => result.current.updateLevelQuery('  12345  '))

        await act(async () => result.current.submitLevelQuery())

        expect(resolveAsync).toHaveBeenCalledWith('12345')
      })
    })
  })

  describe('the collection picker', () => {
    it('lists every collection by default', () => {
      const { result } = renderOnPickStep()

      expect(result.current.filteredCollections.map((c) => c.id)).toEqual([
        'wtb',
        'fav',
        'demons',
      ])
    })

    it('filters by name, case-insensitively', () => {
      const { result } = renderOnPickStep()

      act(() => result.current.setCollectionQuery('EXTREME'))

      expect(result.current.filteredCollections.map((c) => c.id)).toEqual([
        'demons',
      ])
    })

    it('ignores a whitespace-only filter', () => {
      const { result } = renderOnPickStep()

      act(() => result.current.setCollectionQuery('   '))

      expect(result.current.filteredCollections).toHaveLength(3)
    })

    // Want to Beat only ever holds unbeaten levels, so offering it for a
    // completed level would only ever produce a server rejection.
    it('hides Want to Beat for a level the user has already beaten', () => {
      vi.mocked(useMyProgress).mockReturnValue(progressWith(['12345']))
      const { result } = renderOnPickStep()

      expect(result.current.filteredCollections.map((c) => c.id)).toEqual([
        'fav',
        'demons',
      ])
    })

    it('keeps Want to Beat for an unbeaten level', () => {
      vi.mocked(useMyProgress).mockReturnValue(progressWith(['99999']))
      const { result } = renderOnPickStep()

      expect(result.current.filteredCollections.map((c) => c.id)).toContain(
        'wtb'
      )
    })

    // A level resolved from RobTop reports its own completion, and the picker
    // must honour that rather than the progress list — the seeded card has
    // already promised the user that Want to Beat won't be offered next.
    it('hides Want to Beat when the picked level reports itself as beaten', () => {
      vi.mocked(useMyProgress).mockReturnValue(progressWith([]))
      const { result } = render()

      act(() => result.current.selectLevel({ ...level, completed: true }))

      expect(result.current.filteredCollections.map((c) => c.id)).toEqual([
        'fav',
        'demons',
      ])
    })

    it('keeps Want to Beat when the picked level reports itself unbeaten', () => {
      vi.mocked(useMyProgress).mockReturnValue(progressWith([]))
      const { result } = render()

      act(() => result.current.selectLevel({ ...level, completed: false }))

      expect(result.current.filteredCollections.map((c) => c.id)).toContain(
        'wtb'
      )
    })

    // Search results and cached levels carry no viewer state, so the progress
    // list stays the fallback rather than an absent flag reading as unbeaten.
    it('falls back to the progress list when the level carries no flag', () => {
      vi.mocked(useMyProgress).mockReturnValue(progressWith(['12345']))
      const { result } = render()

      act(() => result.current.selectLevel(level))

      expect(result.current.filteredCollections.map((c) => c.id)).not.toContain(
        'wtb'
      )
    })

    it('reports whether any built-ins exist', () => {
      const { result } = renderOnPickStep()
      expect(result.current.hasBuiltIns).toBe(true)

      vi.mocked(useCollections).mockReturnValue(
        stubQuery<CollectionSummary[]>({ data: [demons] })
      )
      const { result: customOnly } = renderOnPickStep()
      expect(customOnly.current.hasBuiltIns).toBe(false)
    })

    it.each([
      ['loading', { isLoading: true }, 'collectionsLoading'],
      ['failed', { isError: true }, 'collectionsFailed'],
    ] as const)('passes the %s state through', (_label, state, flag) => {
      vi.mocked(useCollections).mockReturnValue(
        stubQuery<CollectionSummary[]>(state)
      )
      const { result } = render()

      expect(result.current[flag]).toBe(true)
      expect(result.current.filteredCollections).toEqual([])
    })

    it('toggles a collection on and off', () => {
      const { result } = renderOnPickStep()

      act(() => result.current.toggleCollection('fav', true))
      expect([...result.current.selectedIds]).toEqual(['fav'])

      act(() => result.current.toggleCollection('fav', false))
      expect(result.current.selectedIds.size).toBe(0)
    })

    it('marks the collections that already hold the level', () => {
      detailsFor([
        makeCollectionDetail({ id: 'wtb', entries: [] }),
        makeCollectionDetail({
          id: 'fav',
          entries: [makeEntry({ level: makeLevel({ inGameId: '12345' }) })],
        }),
        makeCollectionDetail({
          id: 'demons',
          entries: [makeEntry({ level: makeLevel({ inGameId: '99999' }) })],
        }),
      ])
      const { result } = renderOnPickStep()

      expect([...result.current.levelAlreadyInCollectionIds]).toEqual(['fav'])
    })

    it('marks nothing before a level has been picked', () => {
      detailsFor([
        makeCollectionDetail({
          id: 'wtb',
          entries: [makeEntry({ level: makeLevel({ inGameId: '12345' }) })],
        }),
        undefined,
        undefined,
      ])
      const { result } = render()

      expect(result.current.levelAlreadyInCollectionIds.size).toBe(0)
    })

    // The details load after the picker renders, so a user can tick a
    // collection before we know the level is already in it.
    it('unticks a selection once the details reveal the level is already there', async () => {
      const { result, rerender } = renderOnPickStep()
      act(() => result.current.toggleCollection('fav', true))
      act(() => result.current.toggleCollection('demons', true))

      detailsFor([
        undefined,
        makeCollectionDetail({
          id: 'fav',
          entries: [makeEntry({ level: makeLevel({ inGameId: '12345' }) })],
        }),
        undefined,
      ])
      rerender({ open: true })

      await waitFor(() =>
        expect([...result.current.selectedIds]).toEqual(['demons'])
      )
    })
  })

  describe('adding', () => {
    const pickAndSelect = (ids: string[]) => {
      const view = renderOnPickStep()
      for (const id of ids)
        act(() => view.result.current.toggleCollection(id, true))
      return view
    }

    it('adds the level to every selected collection', async () => {
      const { result } = pickAndSelect(['fav', 'demons'])

      await act(async () => result.current.handleAdd())

      expect(addAsync).toHaveBeenCalledTimes(2)
      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'fav',
        levelId: '12345',
      })
      expect(addAsync).toHaveBeenCalledWith({
        collectionId: 'demons',
        levelId: '12345',
      })
    })

    it('confirms with the collection names and closes', async () => {
      const { result, onClose } = pickAndSelect(['fav', 'demons'])

      await act(async () => result.current.handleAdd())

      expect(toast.success).toHaveBeenCalledWith(
        'Added to Favorites, Extreme Demons'
      )
      expect(onClose).toHaveBeenCalledOnce()
    })

    // One collection failing must not discard the writes that landed — the
    // adds are independent, so the report is per collection.
    it('reports each failure but still confirms the successes', async () => {
      addAsync.mockImplementation((vars: { collectionId: string }) =>
        vars.collectionId === 'fav'
          ? Promise.reject(apiError(409, 'Already in collection'))
          : Promise.resolve(undefined)
      )
      const { result, onClose } = pickAndSelect(['fav', 'demons'])

      await act(async () => result.current.handleAdd())

      expect(toast.error).toHaveBeenCalledWith('Already in collection')
      expect(toast.success).toHaveBeenCalledWith('Added to Extreme Demons')
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('stays open when every add fails', async () => {
      addAsync.mockRejectedValue(apiError(500, 'Server error'))
      const { result, onClose } = pickAndSelect(['fav', 'demons'])

      await act(async () => result.current.handleAdd())

      expect(toast.success).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('names the collection that rejected a beaten level', async () => {
      addAsync.mockRejectedValue(
        apiError(400, 'LEVEL_ALREADY_COMPLETED', {
          error: 'LEVEL_ALREADY_COMPLETED',
        })
      )
      const { result } = pickAndSelect(['wtb'])

      await act(async () => result.current.handleAdd())

      expect(toast.error).toHaveBeenCalledWith(
        'Want to Beat: Want to Beat only holds unbeaten levels'
      )
    })

    it('falls back to generic copy for a non-API failure', async () => {
      addAsync.mockRejectedValue(new Error('offline'))
      const { result } = pickAndSelect(['demons'])

      await act(async () => result.current.handleAdd())

      expect(toast.error).toHaveBeenCalledWith(
        'Could not add to Extreme Demons'
      )
    })

    it('does nothing when no collection is selected', async () => {
      const { result } = renderOnPickStep()

      await act(async () => result.current.handleAdd())

      expect(addAsync).not.toHaveBeenCalled()
    })

    it('does nothing when no level has been picked', async () => {
      const { result } = render()

      act(() => result.current.toggleCollection('fav', true))
      await act(async () => result.current.handleAdd())

      expect(addAsync).not.toHaveBeenCalled()
    })

    // Double-clicking Add would otherwise write every entry twice.
    it('ignores a second confirm while the first is in flight', async () => {
      let finish: () => void = () => {}
      addAsync.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve
        })
      )
      const { result } = pickAndSelect(['fav'])

      act(() => result.current.handleAdd())
      await waitFor(() => expect(result.current.isSubmitting).toBe(true))
      act(() => result.current.handleAdd())

      expect(addAsync).toHaveBeenCalledTimes(1)

      await act(async () => finish())
      expect(result.current.isSubmitting).toBe(false)
    })
  })

  it('resets everything when the dialog reopens', async () => {
    const { result, rerender } = render()
    act(() => result.current.selectLevel(level))
    act(() => result.current.toggleCollection('fav', true))
    act(() => result.current.setCollectionQuery('fav'))

    rerender({ open: false })
    rerender({ open: true })

    expect(result.current.step).toBe('search')
    expect(result.current.pickedLevel).toBeNull()
    expect(result.current.levelQuery).toBe('')
    expect(result.current.collectionQuery).toBe('')
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.seededLevel).toBeNull()
    expect(escalation.clear).toHaveBeenCalled()
  })

  it('reopens on the picker when the caller supplied a level', () => {
    const { result, rerender } = render({ preselectedLevel: level })
    act(() => result.current.goBackToSearch())

    rerender({ open: false })
    rerender({ open: true })

    expect(result.current.step).toBe('pick')
    expect(result.current.pickedLevel).toEqual(level)
  })
})
